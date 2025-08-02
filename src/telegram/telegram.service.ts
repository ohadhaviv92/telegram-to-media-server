import { Injectable, Logger } from "@nestjs/common"
import { Telegraf } from "telegraf"
import { ConfigService } from "@nestjs/config"

@Injectable()
export class TelegramService {
  private bot: Telegraf
  private readonly logger = new Logger(TelegramService.name)

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>("TELEGRAM_BOT_TOKEN")
    if (!token) {
      this.logger.error("TELEGRAM_BOT_TOKEN not found in environment variables!")
      throw new Error("TELEGRAM_BOT_TOKEN not set")
    }

    this.bot = new Telegraf(token)
    this.logger.log("Telegram bot initialized")
  }

  async sendMessage(chatId: number | string, text: string, options?: any): Promise<any> {
    try {
      return await this.bot.telegram.sendMessage(chatId, text, options)
    } catch (error) {
      this.logger.error(`Failed to send message to ${chatId}: ${error.message}`)
      throw error
    }
  }

  async sendMessageWithInlineKeyboard(
    chatId: number | string,
    text: string,
    keyboard: any[][],
    options?: any
  ): Promise<any> {
    try {
      console.log("Sending message with inline keyboard", { chatId, text, keyboard, options })

      // If parse_mode is Markdown, escape special characters or use MarkdownV2
      let processedText = text
      if (options?.parse_mode === "Markdown") {
        // Replace backticks with code formatting that works with Telegram Markdown
        processedText = text.replace(/`([^`]+)`/g, "_$1_")
      }

      const reply_markup = {
        inline_keyboard: keyboard,
      }
      return await this.bot.telegram.sendMessage(chatId, processedText, {
        reply_markup,
        ...options,
      })
    } catch (error) {
      this.logger.error(`Failed to send message with keyboard to ${chatId}: ${error.message}`)

      // Fallback: try sending without parse_mode if Markdown parsing fails
      if (error.message.includes("can't parse entities")) {
        this.logger.warn(`Retrying message without parse_mode due to parsing error`)
        try {
          const reply_markup = {
            inline_keyboard: keyboard,
          }
          const fallbackOptions = { ...options }
          delete fallbackOptions.parse_mode
          return await this.bot.telegram.sendMessage(chatId, text, {
            reply_markup,
            ...fallbackOptions,
          })
        } catch (fallbackError) {
          this.logger.error(`Fallback also failed: ${fallbackError.message}`)
          throw fallbackError
        }
      }
      throw error
    }
  }

  async editMessageText(chatId: number | string, messageId: number, text: string, options?: any): Promise<any> {
    try {
      console.log("Editing message text", { chatId, messageId, text, options })
      return await this.bot.telegram.editMessageText(chatId, messageId, undefined, text, options)
    } catch (error) {
      this.logger.error(`Failed to edit message ${messageId} in chat ${chatId}: ${error.message}`)
      throw error
    }
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<any> {
    try {
      return await this.bot.telegram.answerCbQuery(callbackQueryId, text)
    } catch (error) {
      this.logger.error(`Failed to answer callback query ${callbackQueryId}: ${error.message}`)
      throw error
    }
  }
}
