import { Injectable, Logger } from '@nestjs/common';
import { OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly telegramService: TelegramService) {}

  @OnQueueCompleted({
    name: 'video-queue',
  })
  async handleVideoProcessingCompleted(job: Job, result: any) {
    this.logger.log(`Job ${job.id} completed with result: ${JSON.stringify(result)}`);

    if (result && result.notification) {
      const { chatId, messageId, message } = result.notification;
      
      try {
        await this.telegramService.sendMessage(
          chatId,
          message,
          { reply_to_message_id: messageId }
        );
        this.logger.log(`Notification sent to chat ${chatId}`);
      } catch (error) {
        this.logger.error(`Failed to send notification: ${error.message}`);
      }
    }
  }

  @OnQueueFailed({
    name: 'video-queue',
  })
  async handleVideoProcessingFailed(job: Job, error: any) {
    this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
    
    const { chatId, messageId } = job.data;

    try {
      await this.telegramService.sendMessage(
        chatId,
        `Sorry, there was an error processing your video. Please try again later.`,
        { reply_to_message_id: messageId }
      );
    } catch (notifyError) {
      this.logger.error(`Failed to send error notification: ${notifyError.message}`);
    }
  }
}
