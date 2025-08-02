import { Injectable, Logger } from "@nestjs/common"
import { Queue } from "bull"
import { InjectQueue } from "@nestjs/bull"

interface VideoJobData {
  fileId: string
  fileName: string
  chatId: number | string
  userId: number
  messageId: number
  caption?: string
}

interface ConfirmedVideoJobData extends VideoJobData {
  targetFilePath: string
}

@Injectable()
export class VideoQueueService {
  private readonly logger = new Logger(VideoQueueService.name)

  constructor(@InjectQueue("video-queue") private videoQueue: Queue) {}

  async addVideoToQueue(videoData: VideoJobData): Promise<any> {
    this.logger.log(`Adding video to queue: ${JSON.stringify(videoData)}`)

    const job = await this.videoQueue.add("download-video", videoData, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    })

    this.logger.log(`Video added to queue with job ID: ${job.id}`)

    return job
  }

  async addConfirmedVideoToQueue(confirmedVideoData: ConfirmedVideoJobData): Promise<any> {
    this.logger.log(`Adding confirmed video to queue: ${JSON.stringify(confirmedVideoData)}`)

    const job = await this.videoQueue.add("download-video-confirmed", confirmedVideoData, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    })

    this.logger.log(`Confirmed video added to queue with job ID: ${job.id}`)

    return job
  }
}
