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
  @NeedLogin()
  @Get()
  async list(@Req() req: Request): Promise<DepartmentListResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.list(userId);
  }

  @RequirePermission('organization', 'view')
  @NeedLogin()
  @Get('flat')
  async listFlat(@Req() req: Request) {
    const { userId } = req.userContext as { userId: string };
    return this.service.listFlat(userId);
  }

  @RequirePermission('organization', 'view')
  @NeedLogin()
  @Get(':id')
  async detail(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<DepartmentTreeNode> {
    const { userId } = req.userContext as { userId: string };
    return this.service.detail(id, userId);
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
