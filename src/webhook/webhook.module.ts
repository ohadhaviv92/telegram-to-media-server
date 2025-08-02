import { Module } from "@nestjs/common"
import { TelegramWebhookController } from "../telegram/telegram-webhook.controller"
import { TelegramModule } from "../telegram/telegram.module"
import { VideoModule } from "../video/video.module"

@Module({
  imports: [TelegramModule, VideoModule],
  controllers: [TelegramWebhookController],
})
export class WebhookModule {}
