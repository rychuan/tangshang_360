import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { PerformanceGradeService } from './performance-grade.service';
import type {
  PerformanceGradeListResponse,
  ActiveGradeListResponse,
  CreatePerformanceGradeRequest,
  UpdatePerformanceGradeRequest,
  CreateResponse,
  SuccessResponse,
} from '@shared/api.interface';

@Controller('api/performance-grades')
export class PerformanceGradeController {
  constructor(private readonly service: PerformanceGradeService) {}

  @CanRole(['admin', 'hrd'])
  @RequirePermission('grade_config', 'view')
  @NeedLogin()
  @Get()
  async list(): Promise<PerformanceGradeListResponse> {
    return this.service.list();
  }

  @NeedLogin()
  @Get('active')
  async listActive(): Promise<ActiveGradeListResponse> {
    return this.service.listActive();
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('grade_config', 'edit')
  @NeedLogin()
  @Post()
  async create(
    @Body() body: CreatePerformanceGradeRequest,
  ): Promise<CreateResponse> {
    return this.service.create(body);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('grade_config', 'edit')
  @NeedLogin()
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdatePerformanceGradeRequest,
  ): Promise<SuccessResponse> {
    return this.service.update(id, body);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('grade_config', 'edit')
  @NeedLogin()
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<SuccessResponse> {
    return this.service.remove(id);
  }
}
