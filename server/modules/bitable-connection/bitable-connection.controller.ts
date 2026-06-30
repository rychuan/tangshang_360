import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { BitableConnectionService } from './bitable-connection.service';
import type {
  BitableConnectionListResponse,
  BitableConnectionItem,
  CreateBitableConnectionRequest,
  BitableSyncLogListResponse,
  BitableSyncLogDetail,
  BitableImportResponse,
  BitableExportResponse,
} from '@shared/api.interface';

@Controller('api/bitable-connections')
export class BitableConnectionController {
  constructor(private readonly service: BitableConnectionService) {}

  @CanRole(['admin', 'hrd'])
  @Get()
  async list(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ): Promise<BitableConnectionListResponse> {
    return this.service.list({
      page: parseInt(page, 10) || 1,
      pageSize: Math.min(parseInt(pageSize, 10) || 20, 100),
    });
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Post()
  async create(
    @Req() req: any,
    @Body() body: CreateBitableConnectionRequest,
  ): Promise<{ id: string }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.create(body, userId);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Put(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CreateBitableConnectionRequest,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.update(id, body, userId);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.service.remove(id);
  }

  @CanRole(['admin', 'hrd'])
  @Get(':id')
  async detail(
    @Param('id') id: string,
  ): Promise<BitableConnectionItem> {
    return this.service.detail(id);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Post(':id/import')
  async importEmployees(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<BitableImportResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.importEmployees(id, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Post(':id/export')
  async exportEmployees(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<BitableExportResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.exportEmployees(id, userId);
  }

  @CanRole(['admin', 'hrd'])
  @Get(':id/logs')
  async getLogs(
    @Param('id') id: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ): Promise<BitableSyncLogListResponse> {
    return this.service.getLogs(id, {
      page: parseInt(page, 10) || 1,
      pageSize: Math.min(parseInt(pageSize, 10) || 20, 100),
    });
  }

  @CanRole(['admin', 'hrd'])
  @Get(':id/logs/:logId')
  async getLogDetail(
    @Param('id') id: string,
    @Param('logId') logId: string,
  ): Promise<BitableSyncLogDetail> {
    return this.service.getLogDetail(id, logId);
  }
}
