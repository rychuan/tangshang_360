import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { TeamStructureService } from './team-structure.service';
import type { Request } from 'express';
import type {
  CreateBindingRequest,
  BatchDeactivateRequest,
} from '@shared/api.interface';

type PatchEmployeeRequest = {
  name?: string;
  position?: string;
  department?: string;
  supervisorId?: string;
  status?: string;
};

@Controller('api/team-structure')
export class TeamStructureController {
  constructor(private readonly service: TeamStructureService) {}

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('organization', 'view')
  @Get()
  async list(
    @Query('employeeName') employeeName?: string,
    @Query('department') department?: string,
    @Query('position') position?: string,
    @Query('templateId') templateId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list({
      employeeName,
      department,
      position,
      templateId,
      page,
      pageSize,
    });
  }

  @CanRole(['admin'])
  @RequirePermission('organization', 'edit')
  @NeedLogin()
  @Post()
  async create(@Req() req: Request, @Body() body: CreateBindingRequest) {
    const { userId }: { userId: string } = req.userContext;
    return this.service.create(body, userId);
  }

  @CanRole(['admin'])
  @RequirePermission('organization', 'edit')
  @NeedLogin()
  @Patch('employees/deactivate')
  async batchDeactivate(@Req() req: Request, @Body() body: BatchDeactivateRequest) {
    const { userId }: { userId: string } = req.userContext;
    return this.service.batchDeactivate(body.employeeIds, userId);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('organization', 'view')
  @Get('employee/:id')
  async getEmployee(@Param('id') id: string) {
    return this.service.getEmployee(id);
  }

  @CanRole(['admin'])
  @RequirePermission('organization', 'edit')
  @NeedLogin()
  @Patch('employee/:id')
  async updateEmployee(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: PatchEmployeeRequest,
  ) {
    const { userId }: { userId: string } = req.userContext;
    return this.service.updateEmployee(id, body, userId);
  }

  @CanRole(['admin'])
  @RequirePermission('organization', 'edit')
  @NeedLogin()
  @Patch(':id/deactivate')
  async deactivate(@Req() req: Request, @Param('id') id: string) {
    const { userId }: { userId: string } = req.userContext;
    return this.service.deactivate(id, userId);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('organization', 'view')
  @Get(':employeeId/history')
  async history(@Param('employeeId') employeeId: string) {
    return this.service.history(employeeId);
  }
}
