import { Injectable, Logger } from "@nestjs/common"

interface PendingVideoJob {
  jobId: string
  fileId: string
  fileName: string
  chatId: number | string
  userId: number
  messageId: number
  caption?: string
  proposedPath: string
  confirmationMessageId?: number
  waitingForCustomPath?: boolean
}

@Injectable()
export class VideoPathConfirmationService {
  private readonly logger = new Logger(VideoPathConfirmationService.name)
  private pendingJobs = new Map<string, PendingVideoJob>()

  storePendingJob(
    jobId: string,
    videoInfo: {
      fileId: string
      fileName: string
      chatId: number | string
      userId: number
      messageId: number
      caption?: string
    },
    proposedPath: string
  ): void {
    const pendingJob: PendingVideoJob = {
      jobId,
      ...videoInfo,
      proposedPath,
    }

    this.pendingJobs.set(jobId, pendingJob)
    this.logger.log(`Stored pending job ${jobId} for user confirmation`)
  }

  updateConfirmationMessageId(jobId: string, confirmationMessageId: number): void {
    const job = this.pendingJobs.get(jobId)
    if (job) {
      job.confirmationMessageId = confirmationMessageId
      this.pendingJobs.set(jobId, job)
    }
  }

  getPendingJob(jobId: string): PendingVideoJob | undefined {
    return this.pendingJobs.get(jobId)
  }

  removePendingJob(jobId: string): void {
    this.pendingJobs.delete(jobId)
    this.logger.log(`Removed pending job ${jobId}`)
  }

  getAllPendingJobs(): PendingVideoJob[] {
    return Array.from(this.pendingJobs.values())
  }

  setWaitingForCustomPath(jobId: string, chatId: number | string): void {
    const job = this.pendingJobs.get(jobId)
    if (job) {
      job.waitingForCustomPath = true
      this.pendingJobs.set(jobId, job)
      this.logger.log(`Job ${jobId} is now waiting for custom path input`)
    }
  }

  clearWaitingForCustomPath(jobId: string): void {
    const job = this.pendingJobs.get(jobId)
    if (job) {
      job.waitingForCustomPath = false
      this.pendingJobs.set(jobId, job)
      this.logger.log(`Job ${jobId} is no longer waiting for custom path input`)
    }
  }

  getJobWaitingForCustomPath(chatId: number | string, userId: number): PendingVideoJob | undefined {
    for (const job of this.pendingJobs.values()) {
      if (job.chatId === chatId && job.userId === userId && job.waitingForCustomPath) {
        return job
      }
    }
    return undefined
  }

  updatePendingJobPath(jobId: string, newPath: string): void {
    const job = this.pendingJobs.get(jobId)
    if (job) {
      job.proposedPath = newPath
      this.pendingJobs.set(jobId, job)
      this.logger.log(`Updated path for job ${jobId} to: ${newPath}`)
    }
  }

  // Clean up jobs older than 1 hour to prevent memory leaks
  cleanupExpiredJobs(): void {
    // For this simple implementation, we could add timestamps and cleanup logic
    // For now, this is a placeholder for future enhancement
  }
}
