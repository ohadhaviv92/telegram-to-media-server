import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Post, Body } from '@nestjs/common';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }


  @Post('searchMessages')
  postKeyword(@Body() body: {keyword:string}): any {
    return this.appService.searchMessages(body.keyword);
  }

  @Post("forwardMessage")
  forwardMessage(@Body() body: { chatId: string, messageId: number }): any {
    return this.appService.forwardMessage(body.chatId, body.messageId);
  }

}
