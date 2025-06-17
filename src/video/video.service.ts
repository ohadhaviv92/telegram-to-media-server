import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private bot: Telegraf;

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.error('TELEGRAM_BOT_TOKEN not found in environment variables!');
      throw new Error('TELEGRAM_BOT_TOKEN not set');
    }

    this.bot = new Telegraf(token,{telegram: { apiRoot: 'http://localhost:8081' }});
    this.logger.log('Video service initialized with Telegram bot');
  }

  async getFileLink(fileId: string): Promise<string> {
    try {
      const file = await this.bot.telegram.getFile(fileId);
      console.log(file)
      console.log(`File path for ${fileId}: ${file.file_path}`);
      // Return the local file path
      return file.file_path!;
    } catch (error) {
      this.logger.error(`Failed to get file path for ${fileId}: ${error.message}`);
      throw error;
    }
  }
}
