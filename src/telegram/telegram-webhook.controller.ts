import { Controller, Post, Body, Logger } from "@nestjs/common"
import { TelegramService } from "./telegram.service"
import { VideoQueueService } from "../video/video-queue.service"

@Controller("webhook")
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name)

  constructor(
    private readonly telegramService: TelegramService,
    private readonly videoQueueService: VideoQueueService
  ) {}

  @Post()
  async handleTelegramWebhook(@Body() update: any) {
    console.log("Received webhook update:", update)
    console.log("Received webhook update:", update)
    this.logger.log(`Received webhook update: ${JSON.stringify(update)}`)
    if (update.message?.video) {
      this.logger.log(`New video received: ${JSON.stringify(update.message.video)}`)

      const videoInfo = {
        fileId: update.message.video.file_id,
        fileName: update.message.video.file_name || `video_${Date.now()}.mp4`,
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

      const videoInfo = {
        fileId: update.message.document.file_id,
        fileName: update.message.document.file_name || `video_${Date.now()}.mp4`,
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
    messageId: number,
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
}
