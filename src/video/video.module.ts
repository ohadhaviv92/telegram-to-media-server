import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { VideoQueueService } from './video-queue.service';
import { VideoProcessor } from './video.processor';
import { VideoService } from './video.service';
import { TelegramModule } from 'src/telegram/telegram.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'video-queue',
    }),
    TelegramModule
  ],
  controllers: [],
  providers: [VideoQueueService, VideoProcessor, VideoService],
  exports: [VideoQueueService, VideoService],
})
export class VideoModule {}
