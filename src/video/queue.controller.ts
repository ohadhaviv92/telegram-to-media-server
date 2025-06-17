import { Controller, Get, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Controller('queue')
export class QueueController {
  private readonly logger = new Logger(QueueController.name);

  constructor(
    @InjectQueue('video-queue') private videoQueue: Queue,
  ) {}

  @Get('status')
  async getQueueStatus() {
    try {
      const [
        activeCount,
        completedCount,
        failedCount,
        delayedCount,
        waitingCount,
      ] = await Promise.all([
        this.videoQueue.getActiveCount(),
        this.videoQueue.getCompletedCount(),
        this.videoQueue.getFailedCount(),
        this.videoQueue.getDelayedCount(),
        this.videoQueue.getWaitingCount(),
      ]);

      return {
        active: activeCount,
        completed: completedCount,
        failed: failedCount,
        delayed: delayedCount, 
        waiting: waitingCount,
        total: activeCount + completedCount + failedCount + delayedCount + waitingCount,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue status: ${error.message}`);
      throw error;
    }
  }

  @Get('clear')
  async clearQueue() {
    try {
      await this.videoQueue.empty();
      return { message: 'Queue cleared successfully' };
    } catch (error) {
      this.logger.error(`Failed to clear queue: ${error.message}`);
      throw error;
    }
  }
}
