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
  BadRequestException,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { EmployeeManagementService } from './employee-management.service';
import type { Request } from 'express';
import type {
  EmployeeListResponse,
  EmployeeDetail,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  CreateBindingRequest,
  BindingTemplateOption,
  EmployeeBindingHistoryResponse,
} from '@shared/api.interface';
import {
  normalizeEmployeePage,
  normalizeEmployeePageSize,
} from '@shared/employee-pagination';

@Controller('api/employees')
export class EmployeeManagementController {
  constructor(private readonly service: EmployeeManagementService) {}

  @RequirePermission('employees', 'view')
  @NeedLogin()
  @Get()
  async list(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('keyword') keyword?: string,
    @Query('department') department?: string,
    @Query('positions') positions?: string,
    @Query('title') title?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('binding') binding?: string,
  ): Promise<EmployeeListResponse> {
    return this.service.list(
      {
        page: normalizeEmployeePage(page),
        pageSize: normalizeEmployeePageSize(pageSize),
        keyword,
        department,
        positions: positions ? positions.split(',').filter(Boolean) : undefined,
        title,
        role,
        status,
        binding,
      },
      req.userContext?.userId || '',
    );
  }

  @RequirePermission('employees', 'view')
  @NeedLogin()
  @Get('positions')
  async getPositions(@Req() req: Request): Promise<{ positions: string[] }> {
    return this.service.getPositions(req.userContext?.userId || '');
  }

  @RequirePermission('employee_binding', 'edit')
  @NeedLogin()
  @Get('binding-templates')
  async bindingTemplates(): Promise<{ items: BindingTemplateOption[] }> {
    return this.service.bindingTemplates();
  }

  @NeedLogin()
  @Get('my/permissions')
  async getMyPermissions(@Req() req: Request) {
    const { userId } = req.userContext as { userId: string };
    return this.service.getMyPermissions(userId);
  }

  @RequirePermission('employee_binding', 'edit')
  @NeedLogin()
  @Post('bind')
  async bind(
    @Req() req: Request,
    @Body() body: CreateBindingRequest,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.bind(body, userId);
  }

  @RequirePermission('employee_binding', 'view')
  @NeedLogin()
  @Get(':id/binding-history')
  async bindingHistory(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<EmployeeBindingHistoryResponse> {
    return this.service.bindingHistory(id, req.userContext?.userId || '');
  }

  @RequirePermission('employees', 'view')
  @NeedLogin()
  @Get(':id')
  async detail(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<EmployeeDetail> {
    return this.service.detail(id, req.userContext?.userId || '');
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Post()
  async create(
    @Req() req: Request,
    @Body() body: CreateEmployeeRequest,
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
    @Body() body: UpdateEmployeeRequest,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.update(id, body, userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Patch(':id/activate')
  async activate(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.activate(id, userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Patch(':id/deactivate')
  async deactivate(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.deactivate(id, userId);
  }

  @RequirePermission('employee_binding', 'edit')
  @NeedLogin()
  @Patch(':id/unbind')
  async unbind(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.unbind(id, userId);
  }

  @RequirePermission('employees', 'delete')
  @NeedLogin()
  @Delete(':id')
  async delete(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    const { userId } = req.userContext as { userId: string };
    return this.service.delete(id, userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Put(':id/permissions')
  async updatePermissions(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { permissions: unknown[] },
  ) {
    const { userId } = req.userContext as { userId: string };
    return this.service.updatePermissions(id, body.permissions, userId);
  }
}
