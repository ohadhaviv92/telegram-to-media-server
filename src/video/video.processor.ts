import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as ytdl from 'ytdl-core';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { VideoService } from './video.service';
import { TelegramService } from 'src/telegram/telegram.service';

@Processor('video-queue')
@Injectable()
export class VideoProcessor {
  private readonly logger = new Logger(VideoProcessor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly videoService: VideoService,
    private readonly telegramService: TelegramService
  ) {}

  @Process('download-video')
  async processVideo(job: Job<any>): Promise<any> {
    const { fileId, fileName, chatId, userId, messageId } = job.data;
    this.logger.log(`Processing video job: ${job.id} for file: ${fileName}`);

    try {
      // Get download path from configuration or use default
      const downloadPath = this.configService.get<string>('DOWNLOAD_PATH') || path.join(process.cwd(), 'downloads');
      
      // Ensure the download directory exists
      await fs.ensureDir(downloadPath);
      
      // Generate a unique filename
      const uniqueFileName = `${Date.now()}_${fileName}`;
      const targetFilePath = path.join(downloadPath, uniqueFileName);
      console.log(`File will be saved to: ${targetFilePath}`);
      
      // Get source file path from Video service
      console.log(`Fetching file path for fileId: ${fileId}`);
      const sourceFilePath = await this.videoService.getFileLink(fileId);
      this.logger.log(`Source file path: ${sourceFilePath}`);
      
      // Move or copy the file to the destination
      try {
        // If it's a YouTube URL, we still need to download it
        if (sourceFilePath && ytdl.validateURL(sourceFilePath)) {
          this.logger.log(`Downloading YouTube video: ${sourceFilePath}`);
          const videoStream = ytdl(sourceFilePath, { quality: 'highest' });
          const fileStream = fs.createWriteStream(targetFilePath);
          videoStream.pipe(fileStream);
          
          await new Promise<void>((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
          });
        } else {
          // For local files, simply copy the file instead of downloading
          this.logger.log(`Moving file from: ${sourceFilePath} to ${targetFilePath}`);
          
          try {
            // Copy the file (using copy instead of move to prevent data loss)
            await fs.copy(sourceFilePath, targetFilePath);
            this.logger.log(`File moved successfully to: ${targetFilePath}`);
          } catch (error) {
            this.logger.error(`Failed to move file: ${error.message}`);
            throw new Error(`File move failed: ${error.message}`);
          }
        }
        
        this.logger.log(`File processed successfully to: ${targetFilePath}`);
        await this.telegramService.sendMessage(
          chatId,
          `Your video has been processed successfully and is ready to view.`,
          { reply_to_message_id: messageId }
        );
        // We'll handle notification in the queue service or through an event
        return {
          success: true,
          path: targetFilePath,
          notification: {
            chatId,
            messageId,
            message: `Your video has been processed successfully and is ready to view.`
          }
        };
      } catch (processingError) {
        await this.telegramService.sendMessage(
          chatId,
          `Sorry, there was an error processing your video: ${processingError.message}`,
          { reply_to_message_id: messageId }
        );
        this.logger.error(`Error processing file: ${processingError.message}`);
        throw processingError;
      }
    } catch (error) {
      this.logger.error(`Failed to process video job ${job.id}: ${error.message}`);
      await this.telegramService.sendMessage(
        chatId,
        `Sorry, there was an error processing your video. Please try again later.`,
        { reply_to_message_id: messageId }
      );
      // Return error info for handling notification elsewhere
      return {
        success: false,
        error: error.message,
        notification: {
          chatId,
          messageId,
          message: `Sorry, there was an error processing your video. Please try again later.`
        }
      };
    }
  }
}
