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
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { SystemDictService } from './system-dict.service';
import type {
  DictListResponse,
  CreateDictRequest,
  UpdateDictRequest,
} from '@shared/api.interface';

@Controller('api/dictionary')
export class SystemDictController {
  constructor(private readonly service: SystemDictService) {}

  @CanRole(['admin', 'hrd'])
  @RequirePermission('dictionary_config', 'view')
  @Get(':type')
  async list(
    @Param('type') type: string,
    @Query('keyword') keyword?: string,
  ): Promise<DictListResponse> {
    return this.service.list(type, keyword);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('dictionary_config', 'edit')
  @NeedLogin()
  @Post(':type')
  async create(
    @Req() req: any,
    @Param('type') type: string,
    @Body() body: CreateDictRequest,
  ): Promise<{ id: string }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.create(type, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('dictionary_config', 'edit')
  @NeedLogin()
  @Put(':type/:id')
  async update(
    @Req() req: any,
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: UpdateDictRequest,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.update(type, id, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('dictionary_config', 'edit')
  @NeedLogin()
  @Delete(':type/:id')
  async remove(
    @Req() req: any,
    @Param('type') type: string,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.remove(type, id, userId);
  }
}
