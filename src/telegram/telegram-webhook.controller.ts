import { Controller, Post, Body, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { TelegramService } from "./telegram.service"
import { VideoQueueService } from "../video/video-queue.service"
import { VideoPathConfirmationService } from "../video/video-path-confirmation.service"

@Controller("webhook")
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name)
  private mediaServerPath = "/app/media-server"
  private showsFolder
  private moviesFolder
  private generalFolder
  constructor(
    private readonly telegramService: TelegramService,
    private readonly videoQueueService: VideoQueueService,
    private readonly videoPathConfirmationService: VideoPathConfirmationService,
    private readonly configService: ConfigService
  ) {
    this.showsFolder = this.configService.get<string>("SHOWS_FOLDER") || "shows"
    this.moviesFolder = this.configService.get<string>("MOVIES_FOLDER") || "movies"
    this.generalFolder = this.configService.get<string>("GENERAL_FOLDER") || "general"
  }

  async onModuleInit() {
    await this.validateAndSetWebhook()
  }

  private async validateAndSetWebhook() {
    this.logger.log("Initializing webhook validation...")

    const botToken = this.configService.get<string>("TELEGRAM_BOT_TOKEN")
    const telegramServerUrl = this.configService.get<string>("TELEGRAM_SERVER_URL")
    const port = this.configService.get<number>("PORT")
    const webhookUrl = `${this.configService.get<string>("WEBHOOK_URL")}:${port}/webhook`
    if (!botToken || !telegramServerUrl || !webhookUrl) {
      this.logger.error("TELEGRAM_BOT_TOKEN or WEBHOOK_URL not configured")
      return
    }

    try {
      // Check current webhook status
      const getWebhookResponse = await fetch(`${telegramServerUrl}/bot${botToken}/getWebhookInfo`)
      const webhookInfo = await getWebhookResponse.json()

      // Validate the response structure
      if (!webhookInfo.ok) {
        this.logger.error(`Failed to get webhook info: ${webhookInfo.description || "Unknown error"}`)
        return
      }

      this.logger.log(`Current webhook URL: ${webhookInfo.result.url || "Not set"}`)

      if (webhookInfo.result.url === telegramServerUrl) {
        this.logger.log(`Webhook already set to: ${telegramServerUrl}`)
        return
      }

      // Set webhook if not already set or different
      const setWebhookResponse = await fetch(`${telegramServerUrl}/bot${botToken}/setWebhook?url=${webhookUrl}`)
      const setResult = await setWebhookResponse.json()

      if (setResult.ok) {
        this.logger.log(`Webhook successfully set to: ${telegramServerUrl}`)
        if (setResult.description) {
          this.logger.log(`Telegram response: ${setResult.description}`)
        }
      } else {
        this.logger.error(`Failed to set webhook: ${setResult.description || "Unknown error"}`)
        throw new Error(`Failed to set webhook: ${setResult.description || "Unknown error"}`)
      }
    } catch (error) {
      this.logger.error(`Error setting webhook: ${error.message}`)
      throw error
    }
  }

  @Post()
  async handleTelegramWebhook(@Body() update: any) {
    console.log("Received webhook update:", update)
    this.logger.log(`Received webhook update: ${JSON.stringify(update)}`)

    // Handle callback queries (button presses)
    if (update.callback_query) {
      return await this.handleCallbackQuery(update.callback_query)
    }

    // Handle text messages (for custom path input)
    if (update.message?.text && !update.message?.video && !update.message?.document) {
      const textResponse = await this.handleTextMessage(update.message)
      if (textResponse) {
        return { status: "ok" }
      }
    }

    if (update.message?.video) {
      this.logger.log(`New video received: ${JSON.stringify(update.message.video)}`)
      const videoExtensions = update.message.video.mime_type ? update.message.video.mime_type.split("/")[1] : "mp4"
      const videoInfo = {
        fileId: update.message.video.file_id,
        fileName:
          update.message.video.file_name || update.message.caption + "." + videoExtensions || `video_${Date.now()}.mp4`,
        caption: update.message.caption,
        chatId: update.message.chat.id,
        userId: update.message.from.id,
        messageId: update.message.message_id,
      }

      await this.processVideo(videoInfo)
    }
    // Handle videos sent as documents (file attachments)
    else if (update.message?.document && this.isVideoDocument(update.message.document)) {
      this.logger.log(`New video document received: ${JSON.stringify(update.message.document)}`)
      const videoExtensions = update.message.document.mime_type
        ? update.message.document.mime_type.split("/")[1]
        : "mp4"
      const videoInfo = {
        fileId: update.message.document.file_id,
        fileName:
          update.message.document.file_name ||
          update.message.caption + "." + videoExtensions ||
          `video_${Date.now()}.mp4`,
        caption: update.message.caption,
        chatId: update.message.chat.id,
        userId: update.message.from.id,
        messageId: update.message.message_id,
      }

      await this.processVideo(videoInfo)
    }

    return { status: "ok" }
  }

  private isVideoDocument(document: any): boolean {
    // Check if the document's mime_type indicates it's a video
    const videoMimeTypes = [
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "video/x-msvideo",
      "video/x-flv",
      "video/webm",
      "video/x-matroska",
    ]

    return document.mime_type && videoMimeTypes.includes(document.mime_type)
  }

  private async processVideo(videoInfo: {
    fileId: string
    fileName: string
    chatId: number | string
    userId: number
    messageId: number
    caption?: string
  }) {
    // Add video to download queue
    await this.videoQueueService.addVideoToQueue(videoInfo)

    // Notify user that the video is being processed
    await this.telegramService.sendMessage(
      videoInfo.chatId,
      `Your video is being processed. I'll notify you when it's ready to view.`,
      { reply_to_message_id: videoInfo.messageId }
    )
  }

  private async handleCallbackQuery(callbackQuery: any) {
    const { id: callbackQueryId, data: callbackData, message, from } = callbackQuery
    this.logger.log(`Received callback query: ${callbackData} from user ${from.id}`)

    try {
      // Parse the callback data
      const [action, jobId, ...params] = callbackData.split(":")

      if (action === "accept") {
        await this.handleAcceptPath(jobId, callbackQueryId, message)
      } else if (action === "change") {
        await this.handleChangePath(jobId, callbackQueryId, message)
      } else if (action === "path") {
        const pathType = params[0]
        await this.handlePathSelection(jobId, pathType, callbackQueryId, message)
      } else if (action === "custom") {
        await this.handleCustomPathRequest(jobId, callbackQueryId, message)
      } else if (action === "copy") {
        await this.handleCopyPath(jobId, callbackQueryId, message)
      } else {
        this.logger.warn(`Unknown callback action: ${action}`)
        await this.telegramService.answerCallbackQuery(callbackQueryId, "Unknown action")
      }
    } catch (error) {
      this.logger.error(`Error handling callback query: ${error.message}`)
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Error processing request")
    }
  }

  private async handleAcceptPath(jobId: string, callbackQueryId: string, message: any) {
    const pendingJob = this.videoPathConfirmationService.getPendingJob(jobId)

    if (!pendingJob) {
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Job not found or expired")
      return
    }

    try {
      // Extract relative path for display
      const basePath = "/media-server/"
      const displayPath = pendingJob.proposedPath.startsWith(basePath)
        ? pendingJob.proposedPath.replace(basePath, "")
        : pendingJob.proposedPath

      // Update the confirmation message
      await this.telegramService.editMessageText(
        message.chat.id,
        message.message_id,
        `✅ **Path Confirmed!**\n\n` + `**Path:** \`${displayPath}\`\n\n` + `Your video is now being processed...`,
        { parse_mode: "Markdown" }
      )

      // Add the confirmed job to the processing queue
      this.logger.log(`Adding confirmed video to queue for job ${jobId} with path: ${pendingJob.proposedPath}`)
      await this.videoQueueService.addConfirmedVideoToQueue({
        fileId: pendingJob.fileId,
        fileName: pendingJob.fileName,
        chatId: pendingJob.chatId,
        userId: pendingJob.userId,
        messageId: pendingJob.messageId,
        caption: pendingJob.caption,
        targetFilePath: pendingJob.proposedPath,
      })

      // Clean up the pending job
      this.videoPathConfirmationService.removePendingJob(jobId)

      await this.telegramService.answerCallbackQuery(callbackQueryId, "Processing started!")
    } catch (error) {
      this.logger.error(`Error accepting path: ${error.message}`)
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Error starting processing")
    }
  }

  private async handleChangePath(jobId: string, callbackQueryId: string, message: any) {
    const pendingJob = this.videoPathConfirmationService.getPendingJob(jobId)

    if (!pendingJob) {
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Job not found or expired")
      return
    }

    try {
      // Update the confirmation message to show available options
      const keyboard = [
        [
          { text: "🎬 Movies", callback_data: `path:${jobId}:movies` },
          { text: "📺 Shows", callback_data: `path:${jobId}:shows` },
        ],
        [
          { text: "📁 General", callback_data: `path:${jobId}:general` },
          { text: "✏️ Custom Path", callback_data: `custom:${jobId}` },
        ],
        [
          { text: "📋 Copy Path", callback_data: `copy:${jobId}` },
          { text: "🔙 Back", callback_data: `accept:${jobId}` },
        ],
      ]

      // Extract relative path for display (hide full path)
      const basePath = "/media-server/"
      const relativePath = pendingJob.proposedPath.startsWith(basePath)
        ? pendingJob.proposedPath.replace(basePath, "")
        : pendingJob.proposedPath

      await this.telegramService.editMessageText(
        message.chat.id,
        message.message_id,
        `📁 **Choose Alternative Path**\n\n` +
          `**Current Path:** \`${relativePath}\`\n\n` +
          `Select where you want to save this file:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: keyboard,
          },
        }
      )

      await this.telegramService.answerCallbackQuery(callbackQueryId, "Choose a new path")
    } catch (error) {
      this.logger.error(`Error showing path options: ${error.message}`)
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Error showing options")
    }
  }

  private async handleCopyPath(jobId: string, callbackQueryId: string, message: any) {
    const pendingJob = this.videoPathConfirmationService.getPendingJob(jobId)

    if (!pendingJob) {
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Job not found or expired")
      return
    }

    try {
      // Extract relative path for copying
      const basePath = "/media-server/"
      const relativePath = pendingJob.proposedPath.startsWith(basePath)
        ? pendingJob.proposedPath.replace(basePath, "")
        : pendingJob.proposedPath

      // Send only the path without additional text
      await this.telegramService.sendMessage(message.chat.id, relativePath, {
        reply_to_message_id: message.message_id,
      })

      await this.telegramService.answerCallbackQuery(callbackQueryId, "Path copied!")
    } catch (error) {
      this.logger.error(`Error copying path: ${error.message}`)
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Error copying path")
    }
  }

  private async handlePathSelection(jobId: string, pathType: string, callbackQueryId: string, message: any) {
    const pendingJob = this.videoPathConfirmationService.getPendingJob(jobId)

    if (!pendingJob) {
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Job not found or expired")
      return
    }

    try {
      // Fixed base path
      const basePath = "/media-server/"
      let newPath: string

      switch (pathType) {
        case "movies": {
          const moviesPath = this.configService.get<string>("MOVIES_PATH") || `${basePath}Movies`
          newPath = `${moviesPath}/${pendingJob.fileName}`
          break
        }
        case "shows": {
          const showsPath = this.configService.get<string>("SHOWS_PATH") || `${basePath}Shows`
          newPath = `${showsPath}/${pendingJob.fileName}`
          break
        }
        case "general": {
          const generalPath = this.configService.get<string>("GENERAL_PATH") || `${basePath}General`
          const uniqueFileName = `${Date.now()}_${pendingJob.fileName}`
          newPath = `${generalPath}/${uniqueFileName}`
          break
        }
        default:
          throw new Error("Invalid path type")
      }

      // Update the pending job with new path
      this.videoPathConfirmationService.updatePendingJobPath(jobId, newPath)

      // Show confirmation with new path
      const keyboard = [
        [
          { text: "✅ Accept Path", callback_data: `accept:${jobId}` },
          { text: "📝 Change Path", callback_data: `change:${jobId}` },
        ],
      ]

      // Extract relative path for display
      const relativePath = newPath.replace(basePath, "")

      await this.telegramService.editMessageText(
        message.chat.id,
        message.message_id,
        `📁 **Updated Path Selection**\n\n` +
          `**Selected Path:** \`${relativePath}\`\n\n` +
          `💡 **Copyable path:** \`${relativePath}\`\n\n` +
          `Please confirm if you want to save the file to this path, or choose to change it again.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: keyboard,
          },
        }
      )

      await this.telegramService.answerCallbackQuery(callbackQueryId, `Path updated to ${pathType}`)
    } catch (error) {
      this.logger.error(`Error updating path: ${error.message}`)
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Error updating path")
    }
  }

  private async handleCustomPathRequest(jobId: string, callbackQueryId: string, message: any) {
    const pendingJob = this.videoPathConfirmationService.getPendingJob(jobId)

    if (!pendingJob) {
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Job not found or expired")
      return
    }

    try {
      // Get the base media path (everything before /media/ is fixed)
      const basePath = "/media-server/"

      // Mark this job as waiting for custom path input
      this.videoPathConfirmationService.setWaitingForCustomPath(jobId, message.chat.id)

      // Update the message to request custom path input
      await this.telegramService.editMessageText(
        message.chat.id,
        message.message_id,
        `✏️ **Custom Path Input**\n\n` +
          `**Base Path (Fixed):** \`${basePath}\`\n\n` +
          `**Current Relative Path:** \`${pendingJob.proposedPath.replace(basePath, "")}\`\n\n` +
          `Please send your custom path **after** \`/media/\`\n` +
          `Example: \`Movies/Action/MyFolder/${pendingJob.fileName}\`\n` +
          `Or: \`Shows/Season 1/episode.mp4\`\n\n` +
          `💡 **Tip:** Click to copy current path:\n` +
          `\`${pendingJob.proposedPath.replace(basePath, "")}\`\n\n` +
          `⚠️ Send the **complete file path** including filename and extension.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [[{ text: "🔙 Cancel", callback_data: `change:${jobId}` }]],
          },
        }
      )

      await this.telegramService.answerCallbackQuery(callbackQueryId, "Send path after /media/")
    } catch (error) {
      this.logger.error(`Error requesting custom path: ${error.message}`)
      await this.telegramService.answerCallbackQuery(callbackQueryId, "Error requesting custom path")
    }
  }

  private async handleTextMessage(message: any): Promise<boolean> {
    const chatId = message.chat.id
    const userId = message.from.id
    const text = message.text.trim()

    // Check if any job is waiting for custom path input from this user
    const waitingJob = this.videoPathConfirmationService.getJobWaitingForCustomPath(chatId, userId)

    if (!waitingJob) {
      return false // Not a custom path input, let other handlers process it
    }

    this.logger.log(`Processing custom path input: "${text}" for job ${waitingJob.jobId}`)

    try {
      // Fixed base path - everything before /media/ is non-editable
      const basePath = "/media-server/"

      // Clean the input path
      let relativePath = text.trim()

      // Remove leading slash if present
      if (relativePath.startsWith("/")) {
        relativePath = relativePath.substring(1)
      }

      // Remove base path if user included it
      if (relativePath.startsWith("Users/ohadhaviv/Documents/Jellyfin/media/")) {
        relativePath = relativePath.replace("Users/ohadhaviv/Documents/Jellyfin/media/", "")
      }

      // Construct the full path (use the custom path as-is, don't append filename)
      const fullPath = basePath + relativePath

      // Validate that the path contains a filename (has an extension)
      if (!relativePath.includes(".")) {
        await this.telegramService.sendMessage(
          chatId,
          `❌ **Invalid Path**\n\nPlease include the complete filename with extension.\n` +
            `Example: \`Movies/Action/${waitingJob.fileName}\``,
          {
            parse_mode: "Markdown",
            reply_to_message_id: message.message_id,
          }
        )
        return true
      }

      // Update the pending job with custom path
      this.videoPathConfirmationService.updatePendingJobPath(waitingJob.jobId, fullPath)
      this.logger.log(`Updated job ${waitingJob.jobId} with custom path: ${fullPath}`)

      // Clear the waiting state
      this.videoPathConfirmationService.clearWaitingForCustomPath(waitingJob.jobId)

      // Find and update the original confirmation message
      if (waitingJob.confirmationMessageId) {
        const keyboard = [
          [
            { text: "✅ Accept Path", callback_data: `accept:${waitingJob.jobId}` },
            { text: "📝 Change Path", callback_data: `change:${waitingJob.jobId}` },
          ],
          [{ text: "📋 Copy Path", callback_data: `copy:${waitingJob.jobId}` }],
        ]

        await this.telegramService.editMessageText(
          chatId,
          waitingJob.confirmationMessageId,
          `📁 **Custom Path Set**\n\n` +
            `**Custom Path:** \`${relativePath}\`\n\n` +
            `💡 **Copyable path:** \`${relativePath}\`\n\n` +
            `Please confirm if you want to save the file to this path, or choose to change it.`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: keyboard,
            },
          }
        )
      }

      // Send confirmation message
      await this.telegramService.sendMessage(
        chatId,
        `✅ **Custom path set successfully!**\n\n` +
          `**Path:** \`${relativePath}\`\n\n` +
          `💡 **Next step:** Click "✅ Accept Path" above to start processing your video.`,
        {
          parse_mode: "Markdown",
          reply_to_message_id: message.message_id,
        }
      )

      return true // Handled successfully
    } catch (error) {
      this.logger.error(`Error handling custom path input: ${error.message}`)
      await this.telegramService.sendMessage(chatId, `❌ Error setting custom path: ${error.message}`, {
        reply_to_message_id: message.message_id,
      })
      return true // Still handled (even if with error)
    }
  }
}
