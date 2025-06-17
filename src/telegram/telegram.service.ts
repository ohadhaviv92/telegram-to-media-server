import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramService.name);

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.logger.error('TELEGRAM_BOT_TOKEN not found in environment variables!');
      throw new Error('TELEGRAM_BOT_TOKEN not set');
    }

    this.bot = new Telegraf(token);
    this.logger.log('Telegram bot initialized');
  }

  async sendMessage(chatId: number | string, text: string, options?: any): Promise<any> {
    try {
      return await this.bot.telegram.sendMessage(chatId, text, options);
    } catch (error) {
      this.logger.error(`Failed to send message to ${chatId}: ${error.message}`);
      throw error;
    }
  }

}
