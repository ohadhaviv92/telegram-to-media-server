import { Injectable, Logger, OnModuleInit } from "@nestjs/common"
import { TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions"
import * as fs from "fs"
import { ConfigService } from "@nestjs/config"
@Injectable()
export class TelegramClientService implements OnModuleInit {
  private readonly logger = new Logger(TelegramClientService.name)
  private client: TelegramClient
  private apiId
  private apiHash
  private readonly SESSION_FILE_PATH = "./session.txt"
  private stringSession: StringSession // Will be initialized in onModuleInit

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.logger.log("Initializing Telegram client...")
    this.apiHash = process.env.TELEGRAM_API_HASH
    this.apiId = parseInt(process.env.TELEGRAM_APP_ID as string, 10)
    let sessionData = ""
    try {
      if (fs.existsSync(this.SESSION_FILE_PATH)) {
        sessionData = fs.readFileSync(this.SESSION_FILE_PATH, "utf8").trim()
        this.logger.log("Found existing session")
      }
    } catch (error) {
      this.logger.warn("Could not load session file", error)
    }
    this.stringSession = new StringSession(sessionData)
    this.client = new TelegramClient(this.stringSession, this.apiId, this.apiHash, {
      connectionRetries: 5,
    })
    // For production, replace these with config or a more secure input method

    // Check if we need to log in or can use existing session
    await this.client.start({
      phoneNumber: async () => this.configService.get<string>("PHONE_NUMBER") as string,
      phoneCode: async () => {
        this.logger.log("Waiting for authentication code...")
        await new Promise((resolve) => setTimeout(resolve, 20_000)) // Simulate delay
        const code = fs.readFileSync("./code.txt", "utf8").trim()
        return code
      },
      onError: (err) => this.logger.error(err),
    })

    this.logger.log("Telegram client connected.")

    // Save the session string to a file for later use
    const sessionString = this.stringSession.save()
    fs.writeFileSync(this.SESSION_FILE_PATH, sessionString)
    this.logger.log("Session saved to session.txt")
  }

  async forwardMessage(msgid: number, fromChatId: number | string) {
    await this.client.forwardMessages(process.env.BOT_CHAT_ID as string, {
      fromPeer: fromChatId,
      messages: [msgid],
    })
  }

  async sendMessageToMe(message: string) {
    if (!this.client) {
      throw new Error("Telegram client not initialized ")
    }
    await this.client.sendMessage("me", { message })
    this.logger.log("Message sent to self.")
  }

  async searchMessages(keyword: string, offset?: number): Promise<any[]> {
    try {
      const messages = await this.client.getMessages(undefined, { search: keyword })
      this.logger.log(`Found ${messages.length} messages containing "${keyword}"`)
      const messagesData = messages
        .filter((msg) => {
          // Only include messages where peerId is a PeerChannel
          return msg.peerId && msg.peerId.className === "PeerChannel"
        })
        .map((msg) => ({
          id: msg.id,
          date: msg.date,
          text: msg.message,
          peerId: msg.peerId,
        }))
      fs.writeFileSync(`./messages_${keyword.replace(/\s+/g, "_")}.json`, JSON.stringify(messagesData, null, 2))
      this.logger.log(`Messages saved to messages_${keyword.replace(/\s+/g, "_")}.json`)
      return messagesData
    } catch (error: any) {
      this.logger.error(`Failed to search messages: ${error.message}`)
      throw error
    }
  }
}
