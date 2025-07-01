import { Controller, Get } from "@nestjs/common"
import { AppService } from "./app.service"
import { Post, Body } from "@nestjs/common"

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello()
  }

  @Post("searchMessages")
  async postKeyword(@Body() body: { keyword: string; offset: number }): Promise<any[]> {
    const res = await this.appService.searchMessages(body.keyword)
    console.log(res.slice(0, 5)) // Log the first 5 results
    return res
  }

  @Post("forwardMessage")
  forwardMessage(@Body() body: { fromChatId: string; messageId: number }): any {
    return this.appService.forwardMessage(body.fromChatId, body.messageId)
  }
}
