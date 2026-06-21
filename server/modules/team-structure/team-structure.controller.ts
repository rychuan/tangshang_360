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
import { TeamStructureService } from './team-structure.service';
import type { CreateBindingRequest, BatchDeactivateRequest } from '@shared/api.interface';

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
  @NeedLogin()
  @Post()
  async create(
    @Req() req: any,
    @Body() body: CreateBindingRequest,
  ) {
    const { userId }: { userId: string } = req.userContext;
    return this.service.create(body, userId);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Patch('employees/deactivate')
  async batchDeactivate(
    @Req() req: any,
    @Body() body: BatchDeactivateRequest,
  ) {
    const { userId }: { userId: string } = req.userContext;
    return this.service.batchDeactivate(body.employeeIds, userId);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @Get('employee/:id')
  async getEmployee(@Param('id') id: string) {
    return this.service.getEmployee(id);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Patch('employee/:id')
  async updateEmployee(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: PatchEmployeeRequest,
  ) {
    const { userId }: { userId: string } = req.userContext;
    return this.service.updateEmployee(id, body, userId);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Patch(':id/deactivate')
  async deactivate(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const { userId }: { userId: string } = req.userContext;
    return this.service.deactivate(id, userId);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @Get(':employeeId/history')
  async history(@Param('employeeId') employeeId: string) {
    return this.service.history(employeeId);
  }
}