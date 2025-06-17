import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { TelegramModule } from '../telegram/telegram.module';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    TelegramModule,
    BullModule.registerQueue({
      name: 'video-queue',
    }),
  ],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
