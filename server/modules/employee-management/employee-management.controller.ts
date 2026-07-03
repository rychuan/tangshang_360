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
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { EmployeeManagementService } from './employee-management.service';
import type { Request } from 'express';
import type {
  EmployeeListResponse,
  EmployeeDetail,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  CreateBindingRequest,
  EmployeeBindingHistoryResponse,
} from '@shared/api.interface';

@Controller('api/employees')
export class EmployeeManagementController {
  constructor(private readonly service: EmployeeManagementService) {}

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('employees', 'view')
  @Get()
  async list(
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('keyword') keyword?: string,
    @Query('department') department?: string,
    @Query('positions') positions?: string,
    @Query('title') title?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
  ): Promise<EmployeeListResponse> {
    return this.service.list({
      page: parseInt(page, 10) || 1,
      pageSize: Math.min(parseInt(pageSize, 10) || 20, 100),
      keyword,
      department,
      positions: positions ? positions.split(',').filter(Boolean) : undefined,
      title,
      role,
      status,
    });
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('employees', 'view')
  @Get('positions')
  async getPositions(): Promise<{ positions: string[] }> {
    return this.service.getPositions();
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])
  @Get('my/permissions')
  async getMyPermissions(@Req() req: Request) {
    const { userId } = req.userContext as { userId: string };
    return this.service.getMyPermissions(userId);
  }

  @CanRole(['admin', 'hrd'])
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

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('employee_binding', 'view')
  @Get(':id/binding-history')
  async bindingHistory(
    @Param('id') id: string,
  ): Promise<EmployeeBindingHistoryResponse> {
    return this.service.bindingHistory(id);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('employees', 'view')
  @Get(':id')
  async detail(@Param('id') id: string): Promise<EmployeeDetail> {
    return this.service.detail(id);
  }

  @CanRole(['admin'])
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

  @CanRole(['admin'])
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

  @CanRole(['admin'])
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

  @CanRole(['admin'])
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

  @CanRole(['admin', 'hrd'])
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

  @CanRole(['admin'])
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

  @CanRole(['admin'])
  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Put(':id/permissions')
  async updatePermissions(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { permissions: unknown[] },
  ) {
    const { userId } = req.userContext as { userId: string };
    const emp = await this.service.detail(id);
    if ((emp.role as string) === 'admin') {
      const adminCount = await this.service.validateAdminsExist();
      if (adminCount <= 1) {
        throw new BadRequestException(
          '系统中至少保留一个系统管理员，无法移除其权限',
        );
      }
    }
    return this.service.updatePermissions(id, body.permissions, userId);
  }
}
