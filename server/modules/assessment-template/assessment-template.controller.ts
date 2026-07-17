import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { AssessmentTemplateService } from './assessment-template.service';
import type { Request } from 'express';
import type {
  AssessmentTemplateListResponse,
  AssessmentTemplateDetail,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CreateResponse,
  SuccessResponse,
} from '@shared/api.interface';

@Controller('api/assessment-templates')
export class AssessmentTemplateController {
  constructor(private readonly service: AssessmentTemplateService) {}

  @RequirePermission('template_management', 'view')
  @Get()
  async list(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('keyword') keyword?: string,
    @Query('position') position?: string,
    @Query('status') status?: string,
  ): Promise<AssessmentTemplateListResponse> {
    const p: number = parseInt(page, 10) || 1;
    const ps: number = parseInt(pageSize, 10) || 20;
    return this.service.list(p, ps, keyword, position, status);
  }

  @RequirePermission('template_management', 'view')
  @Get(':id')
  async detail(@Param('id') id: string): Promise<AssessmentTemplateDetail> {
    return this.service.detail(id);
  }

  @RequirePermission('template_management', 'edit')
  @NeedLogin()
  @Post()
  async create(@Body() body: CreateTemplateRequest): Promise<CreateResponse> {
    return this.service.create(body);
  }

  @RequirePermission('template_management', 'edit')
  @NeedLogin()
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateTemplateRequest,
  ): Promise<SuccessResponse> {
    return this.service.update(id, body);
  }

  @RequirePermission('template_management', 'edit')
  @NeedLogin()
  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string): Promise<SuccessResponse> {
    return this.service.deactivate(id);
  }

  @RequirePermission('template_management', 'delete')
  @NeedLogin()
  @Delete(':id')
  async delete(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<SuccessResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.delete(id, userId);
  }
}
