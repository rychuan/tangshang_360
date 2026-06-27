import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
} from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { PositionService } from './position.service';
import type {
  PositionListResponse,
  CreatePositionRequest,
  UpdatePositionRequest,
} from '@shared/api.interface';

@Controller('api/positions')
export class PositionController {
  constructor(private readonly service: PositionService) {}

  @CanRole(['admin', 'hrd'])
  @Get()
  async list(
    @Query('keyword') keyword?: string,
  ): Promise<PositionListResponse> {
    return this.service.list({ keyword });
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Post()
  async create(
    @Req() req: any,
    @Body() body: CreatePositionRequest,
  ): Promise<{ id: string }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.create(body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdatePositionRequest,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.update(id, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Delete(':id')
  async remove(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.remove(id, userId);
  }
}
