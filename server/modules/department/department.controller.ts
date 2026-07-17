import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Req,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { DepartmentService } from './department.service';
import type { Request } from 'express';
import type {
  DepartmentListResponse,
  DepartmentTreeNode,
  CreateDepartmentRequest,
} from '@shared/api.interface';

@Controller('api/departments')
export class DepartmentController {
  constructor(private readonly service: DepartmentService) {}

  @RequirePermission('organization', 'view')
  @Get()
  async list(): Promise<DepartmentListResponse> {
    return this.service.list();
  }

  @RequirePermission('organization', 'view')
  @Get('flat')
  async listFlat() {
    return this.service.listFlat();
  }

  @RequirePermission('organization', 'view')
  @Get(':id')
  async detail(@Param('id') id: string): Promise<DepartmentTreeNode> {
    return this.service.detail(id);
  }

  @RequirePermission('organization', 'edit')
  @NeedLogin()
  @Post()
  async create(
    @Req() req: Request,
    @Body() body: CreateDepartmentRequest,
  ): Promise<{ id: string }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.create(body, userId);
  }

  @RequirePermission('organization', 'edit')
  @NeedLogin()
  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateDepartmentRequest,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.update(id, body, userId);
  }

  @RequirePermission('organization', 'delete')
  @NeedLogin()
  @Delete(':id')
  async remove(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.remove(id, userId);
  }
}
