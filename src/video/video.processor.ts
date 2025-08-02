import { Injectable, Logger } from "@nestjs/common"
import { Process, Processor } from "@nestjs/bull"
import { Job } from "bull"
import * as fs from "fs-extra"
import * as path from "path"
import * as ytdl from "ytdl-core"
import axios from "axios"
import { ConfigService } from "@nestjs/config"
import { VideoService } from "./video.service"
import { TelegramService } from "src/telegram/telegram.service"
import { VideoClassifierService } from "./video-classifier.service"
import { VideoPathConfirmationService } from "./video-path-confirmation.service"

@Processor("video-queue")
@Injectable()
export class VideoProcessor {
  private readonly logger = new Logger(VideoProcessor.name)
  private generalPath: string

  constructor(
    private readonly configService: ConfigService,
    private readonly videoService: VideoService,
    private readonly telegramService: TelegramService,
    private readonly videoClassifierService: VideoClassifierService,
    private readonly videoPathConfirmationService: VideoPathConfirmationService
  ) {
    // Initialize paths from configuration
    this.generalPath = "app/media-server/" + this.configService.get<string>("GENERAL_FOLDER")
  }

  @Process("download-video")
  async processVideo(job: Job<any>): Promise<any> {
    const { fileId, fileName, chatId, userId, messageId, caption } = job.data
    this.logger.log(`Processing video job: ${job.id} for file: ${fileName}`)

    try {
      // Determine the appropriate file path based on the classifier if enabled
      const useClassifier = this.configService.get<string>("USE_VIDEO_CLASSIFIER") === "TRUE"

      let targetFilePath: string

      if (useClassifier) {
        // Use the classifier to get the appropriate path
        this.logger.log(`Using video classifier for file: ${fileName}`)
        targetFilePath = await this.videoClassifierService.classifyVideo(fileName)
        this.logger.log(`Classifier determined path: ${targetFilePath}`)
      } else {
        // Use general path with unique filename as fallback
        const uniqueFileName = `${Date.now()}_${fileName}`
        targetFilePath = path.join(this.generalPath, uniqueFileName)
        this.logger.log(`Using general path: ${targetFilePath}`)
      }

      // Store the job for user confirmation
      this.videoPathConfirmationService.storePendingJob(
        job.id.toString(),
        { fileId, fileName, chatId, userId, messageId, caption },
        targetFilePath
      )

      // Send confirmation message with inline keyboard
      const keyboard = [
        [
          { text: "✅ Accept Path", callback_data: `accept:${job.id}` },
          { text: "📝 Change Path", callback_data: `change:${job.id}` },
        ],
        [{ text: "📋 Copy Path", callback_data: `copy:${job.id}` }],
      ]

      // Extract base path and relative path for display
      const basePath = "/media-server/"
      const relativePath = targetFilePath.startsWith(basePath) ? targetFilePath.replace(basePath, "") : targetFilePath

      const confirmationMessage = await this.telegramService.sendMessageWithInlineKeyboard(
        chatId,
        `📁 **File Processing Confirmation**\n\n` +
          `**Proposed Path:** \`${relativePath}\`\n\n` +
          `Please confirm if you want to save the file to this path, or choose to change it.`,
        keyboard,
        {
          reply_to_message_id: messageId,
          parse_mode: "Markdown",
        }
      )

      // Store the confirmation message ID for later editing
      this.videoPathConfirmationService.updateConfirmationMessageId(job.id.toString(), confirmationMessage.message_id)

      // Return pending status - the actual processing will happen after user confirmation
      return {
        success: false,
        pending: true,
        message: "Waiting for user path confirmation",
      }
    } catch (error) {
      this.logger.error(`Failed to process video job ${job.id}: ${error.message}`)
      await this.telegramService.sendMessage(
        chatId,
        `Sorry, there was an error processing your video. Please try again later.`,
        { reply_to_message_id: messageId }
      )
      return {
        success: false,
        error: error.message,
        notification: {
          chatId,
          messageId,
          message: `Sorry, there was an error processing your video. Please try again later.`,
        },
      }
    }
  }

  @Process("download-video-confirmed")
  async processVideoWithConfirmedPath(job: Job<any>): Promise<any> {
    const { fileId, fileName, chatId, userId, messageId, caption, targetFilePath } = job.data
    this.logger.log(`Processing confirmed video job: ${job.id} for file: ${fileName} at path: ${targetFilePath}`)

    try {
      this.logger.log(`Starting confirmed video processing for job ${job.id}`)

      // Ensure the target directory exists
      await fs.ensureDir(path.dirname(targetFilePath))
      console.log(`File will be saved to: ${targetFilePath}`)
      this.logger.log(`Target directory ensured: ${path.dirname(targetFilePath)}`)

      // Get source file path from Video service
      console.log(`Fetching file path for fileId: ${fileId}`)
      this.logger.log(`Fetching file path for fileId: ${fileId}`)
      const sourceFilePath = await this.videoService.getFileLink(fileId)
      this.logger.log(`Source file path: ${sourceFilePath}`)

      // Move or copy the file to the destination
      try {
        // If it's a YouTube URL, we still need to download it
        if (sourceFilePath && ytdl.validateURL(sourceFilePath)) {
          this.logger.log(`Downloading YouTube video: ${sourceFilePath}`)
          const videoStream = ytdl(sourceFilePath, { quality: "highest" })
          const fileStream = fs.createWriteStream(targetFilePath)
          videoStream.pipe(fileStream)

          await new Promise<void>((resolve, reject) => {
            fileStream.on("finish", resolve)
            fileStream.on("error", reject)
          })
        } else {
          // For local files, simply copy the file instead of downloading
          this.logger.log(`Moving file from: ${sourceFilePath} to ${targetFilePath}`)

          try {
            // Copy the file (using copy instead of move to prevent data loss)
            await fs.copy(
              sourceFilePath.replace("/var/lib/telegram-bot-api", "/app/telegram-server/shared"),
              targetFilePath
            )
            this.logger.log(`File moved successfully to: ${targetFilePath}`)
          } catch (error) {
            this.logger.error(`Failed to move file: ${error.message}`)
            throw new Error(`File move failed: ${error.message}`)
          }
        }

        this.logger.log(`File processed successfully to: ${targetFilePath}`)

        // Extract relative path for user display
        const basePath = "/media-server/"
        const displayPath = targetFilePath.startsWith(basePath) ? targetFilePath.replace(basePath, "") : targetFilePath

        await this.telegramService.sendMessage(
          chatId,
          `✅ Your video has been processed successfully and saved to:\n\`${displayPath}\``,
          {
            reply_to_message_id: messageId,
            parse_mode: "Markdown",
          }
        )

        return {
          success: true,
          path: targetFilePath,
          notification: {
            chatId,
            messageId,
            message: `Your video has been processed successfully and is ready to view.`,
          },
        }
      } catch (processingError) {
        await this.telegramService.sendMessage(
          chatId,
          `Sorry, there was an error processing your video: ${processingError.message}`,
          { reply_to_message_id: messageId }
        )
        this.logger.error(`Error processing file: ${processingError.message}`)
        throw processingError
      }
    } catch (error) {
      this.logger.error(`Failed to process confirmed video job ${job.id}: ${error.message}`)
      await this.telegramService.sendMessage(
        chatId,
        `Sorry, there was an error processing your video. Please try again later.`,
        { reply_to_message_id: messageId }
      )
      return {
        success: false,
        error: error.message,
        notification: {
          chatId,
          messageId,
          message: `Sorry, there was an error processing your video. Please try again later.`,
        },
      }
    }
  }
}
