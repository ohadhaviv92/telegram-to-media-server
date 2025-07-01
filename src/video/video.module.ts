import { Module } from "@nestjs/common"
import { BullModule } from "@nestjs/bull"
import { VideoQueueService } from "./video-queue.service"
import { VideoProcessor } from "./video.processor"
import { VideoService } from "./video.service"
import { VideoClassifierService } from "./video-classifier.service"
import { TelegramModule } from "src/telegram/telegram.module"

@Module({
  imports: [
    BullModule.registerQueue({
      name: "video-queue",
    }),
    TelegramModule,
  ],
  controllers: [],
  providers: [VideoQueueService, VideoProcessor, VideoService, VideoClassifierService],
  exports: [VideoQueueService, VideoService, VideoClassifierService],
})
export class VideoModule {}
