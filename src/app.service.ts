import { Inject, Injectable } from '@nestjs/common';
import { TelegramClientService } from './telegram/telegram-client.service';
@Injectable()
export class AppService {

  constructor(private telegramClient: TelegramClientService) {}

  getHello(): string {
    return 'Hello World!';
  }


  async searchMessages(keyword: string,offset:number = 0): Promise<any[]> {
    try {
      return await this.telegramClient.searchMessages(keyword,offset);
    } catch (error) {
      console.error(`Error searching messages: ${error.message}`);
      throw error;
    }
  }

  async forwardMessage(fromChatId: string, messageId: number): Promise<any> {
    try {
      return await this.telegramClient.forwardMessage(messageId,fromChatId);
    } catch (error) {
      console.error(`Error forwarding message: ${error.message}`);
      throw error;
    }
  }
}
