import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import { Logger } from "@nestjs/common"

async function bootstrap() {
  const logger = new Logger("Bootstrap")

  const app = await NestFactory.create(AppModule)

  const port = process.env.PORT || 4545
  await app.listen(port)

  logger.log(`Application started on HTTP on port ${port}`)
}

bootstrap().catch((error) => {
  const logger = new Logger("Bootstrap")
  logger.error("Failed to start application", error)
  process.exit(1)
})
