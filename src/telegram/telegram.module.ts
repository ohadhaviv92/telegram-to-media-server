import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramClientService } from './telegram-client.service';

@Module({
  providers: [TelegramService,TelegramClientService],
  exports: [TelegramService,TelegramClientService],
})
export class TelegramModule {}
