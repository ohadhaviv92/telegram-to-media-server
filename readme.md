# Telegram to Media Server

A NestJS-based application that automatically processes video files sent via Telegram and organizes them in your media server with intelligent path classification.

## Features

- 🤖 **Telegram Bot Integration**: Receives video files through Telegram webhooks
- 🎬 **Intelligent Classification**: Automatically categorizes videos into Movies, TV Shows, or General folders
- 🗂️ **Smart Path Management**: Uses AI-powered classification with TMDB integration for accurate naming
- 📁 **Interactive Path Confirmation**: Users can approve, modify, or customize file paths before processing
- 🔄 **Queue Management**: Redis-based job queue for reliable video processing
- 🐳 **Docker Support**: Complete containerized setup with docker-compose
- 🎯 **Flexible Configuration**: Environment-based configuration for different setups

## Architecture

The application consists of several key components:

- **Telegram Webhook Controller**: Handles incoming Telegram updates
- **Video Processor**: Manages video download and file organization
- **Video Classifier**: Uses GuessIt and TMDB API for intelligent file categorization
- **Path Confirmation Service**: Interactive user interface for path approval
- **Queue Service**: Redis-based job processing with Bull

## Prerequisites

- Docker and Docker Compose
- Telegram Bot Token
- TMDB API Token (optional, for enhanced classification)
- Telegram App ID and API Hash (for local Telegram Bot API)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd telegram-to-media-server
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Telegram Bot Configuration
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
   TELEGRAM_APP_ID=your_telegram_app_id_here
   TELEGRAM_API_HASH=your_telegram_api_hash_here
   TELEGRAM_SERVER_URL=http://telegram-bot-api:8081
   WEBHOOK_URL=http://telegram-server
   
   # Server Configuration
   PORT=4545
   
   # Media Folders
   GENERAL_FOLDER=General
   MOVIES_FOLDER=Movies
   SHOWS_FOLDER=Shows
   MEDIA_SERVER_FOLDER_PATH=/path/to/your/media/server
   
   # Classification
   USE_VIDEO_CLASSIFIER=TRUE
   TMDB_API_TOKEN=your_tmdb_api_token_here
   ```

3. **Start the application**
   ```bash
   docker-compose up -d
   ```

4. **Set up your Telegram bot webhook**
   The application automatically configures the webhook on startup.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | Required |
| `TELEGRAM_APP_ID` | Telegram API ID | Required |
| `TELEGRAM_API_HASH` | Telegram API hash | Required |
| `WEBHOOK_URL` | Public URL for webhook | Required |
| `PORT` | Application port | 4545 |
| `MEDIA_SERVER_FOLDER_PATH` | Path to your media server | Required |
| `USE_VIDEO_CLASSIFIER` | Enable intelligent classification | TRUE |
| `TMDB_API_TOKEN` | TMDB API token for metadata | Optional |
| `GENERAL_FOLDER` | General files folder name | General |
| `MOVIES_FOLDER` | Movies folder name | Movies |
| `SHOWS_FOLDER` | TV shows folder name | Shows |

### Folder Structure

The application organizes files in the following structure:

```
/media-server/
├── Movies/
│   └── Movie Title (Year)/
│       └── Movie Title (Year).ext
├── Shows/
│   └── Show Title (Year)/
│       └── Season XX/
│           └── Show Title SXXEXX.ext
└── General/
    └── unclassified_files.ext
```

## Usage

### Sending Videos

1. Send a video file to your Telegram bot
2. The bot will analyze the file and propose a storage path
3. You'll receive an interactive message with options:
   - ✅ **Accept Path**: Confirm the proposed path
   - 📝 **Change Path**: Choose from Movies/Shows/General folders
   - ✏️ **Custom Path**: Enter a custom path
   - 📋 **Copy Path**: Get the proposed path as text

### Path Customization

When choosing "Custom Path":
- Base path `/media-server/` is fixed
- Enter the relative path after the base
- Include the complete filename with extension
- Example: `Movies/Action/MyMovie.mp4`

## API Endpoints

### Health Check
```
GET /health
```
Returns application health status.

### Queue Status
```
GET /queue/status
```
Returns current job queue statistics.

### Clear Queue
```
GET /queue/clear
```
Clears all pending jobs from the queue.

## Development

### Local Development

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start in development mode**
   ```bash
   npm run start:dev
   ```

3. **Run tests**
   ```bash
   npm test
   ```

### Building

```bash
npm run build
```

### Linting

```bash
npm run lint
```

## Docker Services

The application uses multiple Docker services:

- **telegram-server**: Main NestJS application
- **telegram-bot-api**: Local Telegram Bot API server
- **redis**: Job queue backend

### Volumes

- `telegram-bot-api-data`: Telegram API data persistence
- `redis-data`: Redis data persistence  
- `telegram-shared-files`: Shared files between services
- `${MEDIA_SERVER_FOLDER_PATH}:/media-server`: Your media server mount

## Architecture Details

### Video Processing Flow

1. **Webhook Reception**: [`TelegramWebhookController`](src/telegram/telegram-webhook.controller.ts) receives Telegram updates
2. **Queue Addition**: Videos are added to the processing queue via [`VideoQueueService`](src/video/video-queue.service.ts)
3. **Classification**: [`VideoClassifierService`](src/video/video-classifier.service.ts) analyzes the filename using GuessIt and TMDB
4. **User Confirmation**: [`VideoPathConfirmationService`](src/video/video-path-confirmation.service.ts) manages interactive path approval
5. **Processing**: [`VideoProcessor`](src/video/video.processor.ts) handles the actual file movement and organization

### Key Services

- **[`TelegramService`](src/telegram/telegram.service.ts)**: Telegram Bot API wrapper
- **[`VideoService`](src/video/video.service.ts)**: File operations and Telegram file handling
- **[`NotificationService`](src/notification/notification.service.ts)**: Job completion notifications

## Troubleshooting

### Common Issues

1. **Webhook not receiving updates**
   - Check if your `WEBHOOK_URL` is publicly accessible
   - Verify Telegram bot token is correct
   - Check application logs for webhook setup errors

2. **Files not moving to correct paths**
   - Ensure `MEDIA_SERVER_FOLDER_PATH` is correctly mounted
   - Check container permissions (running as root with `user: "0:0"`)
   - Verify folder structure exists or can be created

3. **Classification not working**
   - Ensure `USE_VIDEO_CLASSIFIER=TRUE`
   - Check if GuessIt is properly installed in container
   - Verify TMDB API token if using enhanced classification

### Logs

View application logs:
```bash
docker-compose logs -f telegram-server
```

View all services logs:
```bash
docker-compose logs -f
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the UNLICENSED license.

## Support

For issues and questions, please open an issue in the repository.