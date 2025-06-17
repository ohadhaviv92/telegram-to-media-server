import { Inject, Injectable } from '@nestjs/common';
import { TelegramClientService } from './telegram/telegram-client.service';
@Injectable()
export class AppService {

  constructor(private telegramClient: TelegramClientService) {}

  getHello(): string {
    return 'Hello World!';
  }


  async searchMessages(keyword: string): Promise<any> {
    try {
      return await this.telegramClient.searchMessages(keyword);
    } catch (error) {
      console.error(`Error searching messages: ${error.message}`);
      throw error;
    }
  }

  async forwardMessage(chatId: string, messageId: number): Promise<any> {
    try {
      return await this.telegramClient.forwardMessage(messageId,chatId);
    } catch (error) {
      console.error(`Error forwarding message: ${error.message}`);
      throw error;
    }
  }
}
