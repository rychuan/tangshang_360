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
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { TeamStructureService } from './team-structure.service';
import type { Request } from 'express';
import type {
  CreateBindingRequest,
  BatchDeactivateRequest,
  TeamUpdateEmployeeRequest,
} from '@shared/api.interface';

@Controller('api/team-structure')
export class TeamStructureController {
  constructor(private readonly service: TeamStructureService) {}

  @RequirePermission('employees', 'view')
  @Get()
  async list(
    @Req() req: Request,
    @Query('employeeName') employeeName?: string,
    @Query('department') department?: string,
    @Query('position') position?: string,
    @Query('templateId') templateId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.list(
      {
        employeeName,
        department,
        position,
        templateId,
        page,
        pageSize,
      },
      req.userContext?.userId || '',
    );
  }

  @RequirePermission('employee_binding', 'edit')
  @NeedLogin()
  @Post()
  async create(@Req() req: Request, @Body() body: CreateBindingRequest) {
    const { userId } = req.userContext as { userId: string };
    return this.service.create(body, userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Patch('employees/deactivate')
  async batchDeactivate(
    @Req() req: Request,
    @Body() body: BatchDeactivateRequest,
  ) {
    const { userId } = req.userContext as { userId: string };
    return this.service.batchDeactivate(body.employeeIds, userId);
  }

  @RequirePermission('employees', 'view')
  @Get('employee/:id')
  async getEmployee(@Req() req: Request, @Param('id') id: string) {
    return this.service.getEmployee(id, req.userContext?.userId || '');
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Patch('employee/:id')
  async updateEmployee(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: TeamUpdateEmployeeRequest,
  ) {
    const { userId } = req.userContext as { userId: string };
    return this.service.updateEmployee(id, body, userId);
  }

  @RequirePermission('employee_binding', 'edit')
  @NeedLogin()
  @Patch(':id/deactivate')
  async deactivate(@Req() req: Request, @Param('id') id: string) {
    const { userId } = req.userContext as { userId: string };
    return this.service.deactivate(id, userId);
  }

  @RequirePermission('employee_binding', 'view')
  @Get(':employeeId/history')
  async history(@Req() req: Request, @Param('employeeId') employeeId: string) {
    return this.service.history(employeeId, req.userContext?.userId || '');
  }
}
