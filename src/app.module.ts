import { Module } from "@nestjs/common"
import { ConfigModule } from "./config/config.module"
import { BullModule } from "@nestjs/bull"
import { VideoModule } from "./video/video.module"
import { TelegramModule } from "./telegram/telegram.module"
import { NotificationModule } from "./notification/notification.module"
import { WebhookModule } from "./webhook/webhook.module"
import { HealthController } from "./health.controller"

@Module({
  imports: [
    ConfigModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379"),
      },
    }),
    TelegramModule,
    VideoModule,
    NotificationModule,
    WebhookModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
