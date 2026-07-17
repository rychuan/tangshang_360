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
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { BitableConnectionService } from './bitable-connection.service';
import type { Request } from 'express';
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

  @RequirePermission('employees', 'view')
  @NeedLogin()
  @Get()
  async list(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ): Promise<BitableConnectionListResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.list(
      {
        page: parseInt(page, 10) || 1,
        pageSize: Math.min(parseInt(pageSize, 10) || 20, 100),
      },
      userId,
    );
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Post()
  async create(
    @Req() req: Request,
    @Body() body: CreateBitableConnectionRequest,
  ): Promise<{ id: string }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.create(body, userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateBitableConnectionRequest,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.update(id, body, userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Delete(':id')
  async remove(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.remove(id, userId);
  }

  @RequirePermission('employees', 'view')
  @NeedLogin()
  @Get(':id')
  async detail(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<BitableConnectionItem> {
    const { userId } = req.userContext as { userId: string };
    return this.service.detail(id, userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Post(':id/import')
  async importEmployees(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<BitableImportResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.importEmployees(id, userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Post(':id/export')
  async exportEmployees(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<BitableExportResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.exportEmployees(id, userId);
  }

  @RequirePermission('employees', 'view')
  @NeedLogin()
  @Get(':id/logs')
  async getLogs(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
  ): Promise<BitableSyncLogListResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.getLogs(
      id,
      {
        page: parseInt(page, 10) || 1,
        pageSize: Math.min(parseInt(pageSize, 10) || 20, 100),
      },
      userId,
    );
  }

  @RequirePermission('employees', 'view')
  @NeedLogin()
  @Get(':id/logs/:logId')
  async getLogDetail(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('logId') logId: string,
  ): Promise<BitableSyncLogDetail> {
    const { userId } = req.userContext as { userId: string };
    return this.service.getLogDetail(id, logId, userId);
  }
}
