import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as fs from 'fs';
@Injectable()
export class TelegramClientService implements OnModuleInit {
    private readonly logger = new Logger(TelegramClientService.name);
    private client: TelegramClient;
    private  apiId;
    private  apiHash;
    private readonly SESSION_FILE_PATH = './session.txt';
    
    private stringSession: StringSession; // Will be initialized in onModuleInit

    async onModuleInit() {
        this.logger.log('Initializing Telegram client...');
        this.apiHash = process.env.TELEGRAM_API_HASH;
        this.apiId = parseInt(process.env.TELEGRAM_APP_ID as string, 10);
         let sessionData = '';
        try {
            if (fs.existsSync(this.SESSION_FILE_PATH)) {
                sessionData = fs.readFileSync(this.SESSION_FILE_PATH, 'utf8').trim();
                this.logger.log('Found existing session');
            }
        } catch (error) {
            this.logger.warn('Could not load session file', error);
        }
        this.stringSession = new StringSession(sessionData);
        this.client = new TelegramClient(this.stringSession, this.apiId, this.apiHash, {
            connectionRetries: 5,
        });
        // For production, replace these with config or a more secure input method

                // Check if we need to log in or can use existing session
        await this.client.start({
            phoneNumber: async () => '972506595178',
            phoneCode: async () => {
                this.logger.log('Waiting for authentication code...');
                await new Promise((resolve) => setTimeout(resolve, 20_000)); // Simulate delay
                const code = fs.readFileSync('./code.txt', 'utf8').trim();
                return code;
            },
            onError: (err) => this.logger.error(err),
        });

 this.logger.log('Telegram client connected.');
        
        // Save the session string to a file for later use
        const sessionString = this.stringSession.save();
        fs.writeFileSync(this.SESSION_FILE_PATH, sessionString);
        this.logger.log('Session saved to session.txt');
        
        const messages = await this.searchMessages('lion king'); // Example usage
        console.log(`Found ${messages.length} messages containing "lion king"`);
        await this.forwardMessage(messages[5].id, messages[5].peerId.channelId); // Forward the first message to self
    }
    

    async forwardMessage(msgid: number, chatId: number | string) {
        await this.client.forwardMessages(process.env.BOT_CHAT_ID as string , {
           fromPeer: chatId,
            messages: [msgid]})
    }

    async sendMessageToMe(message: string) {
        if (!this.client) {
            throw new Error('Telegram client not initialized');
        }
        await this.client.sendMessage('me', { message });
        this.logger.log('Message sent to self.');
    }

    async searchMessages(
        keyword: string,
    ): Promise<any[]> {
        try {
            const messages = await this.client.getMessages(undefined, { search: keyword });
            this.logger.log(`Found ${messages.length} messages containing "${keyword}"`);
            const messagesData = messages.map((msg) => ({
            id: msg.id,
            date: msg.date,
            text: msg.message,
            }));
            fs.writeFileSync(
            `./messages_${keyword.replace(/\s+/g, '_')}.json`,
            JSON.stringify(messages, null, 2)
            );
            this.logger.log(`Messages saved to messages_${keyword.replace(/\s+/g, '_')}.json`);
            return messages;
        } catch (error: any) {
            this.logger.error(`Failed to search messages: ${error.message}`);
            throw error;
        }
    }
}