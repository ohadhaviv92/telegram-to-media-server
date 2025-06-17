import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { HttpsOptions } from '@nestjs/common/interfaces/external/https-options.interface';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const httpsOptions: HttpsOptions = {
        key: fs.readFileSync('/etc/letsencrypt/live/local-server.ddns.net/privkey.pem'),
        cert: fs.readFileSync('/etc/letsencrypt/live/local-server.ddns.net/fullchain.pem'),
      };
    const app = await NestFactory.create(AppModule, { httpsOptions });
    
    const port = process.env.PORT || 4545;
    await app.listen(port);
    
    logger.log(`Application started on HTTPS on port ${port}`);
  } catch (error) {
    logger.error(`Failed to start server with HTTPS: ${error.message}`);
    logger.log('Falling back to HTTP');
    
    // Fallback to HTTP if certificate files are not accessible
    const app = await NestFactory.create(AppModule);
    
    const port = process.env.PORT || 4545;
    await app.listen(port);
    
    logger.log(`Application started on HTTP on port ${port}`);
  }
}
bootstrap();
