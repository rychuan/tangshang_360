import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
} from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { AssessmentPublishService } from './assessment-publish.service';
import type { Request } from 'express';
import type {
  PublishRequest,
  AdjustRequest,
  UnlockRequest,
  BatchUnlockRequest,
  BatchNotifyRequest,
  BatchReturnRequest,
  EmployeeSnapshotResponse,
} from '@shared/api.interface';

@Controller('api')
export class AssessmentPublishController {
  constructor(private readonly service: AssessmentPublishService) {}

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('publish_management', 'view')
  @Get('publish/employees')
  async listEmployees(
    @Query('period') period: string,
    @Query('department') department: string,
    @Query('templateId') templateId: string,
  ) {
    return this.service.listEmployees(period, department, templateId);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('publish_management', 'view')
  @Get('assessment-instances')
  async listInstances(
    @Query('period') period: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('status') status: string,
    @Query('department') department: string,
    @Query('grade') grade: string,
  ) {
    return this.service.listInstances(
      period,
      page,
      pageSize,
      status,
      department,
      grade,
    );
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('publish_management', 'view')
  @Get('publish/statistics')
  async getStatistics(@Query('period') period: string) {
    return this.service.getPeriodStatistics(period);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Patch('assessment-instances/batch-unlock')
  async batchUnlock(@Req() req: Request, @Body() body: BatchUnlockRequest) {
    const { userId } = req.userContext;
    return this.service.batchUnlock(body.instanceIds, body.reason, userId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Post('assessment-instances/batch-notify')
  async batchNotify(@Req() req: Request, @Body() body: BatchNotifyRequest) {
    const { userId } = req.userContext;
    return this.service.batchResendNotification(body.instanceIds, userId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Post('assessment-instances/batch-return')
  async batchReturn(@Req() req: Request, @Body() body: BatchReturnRequest) {
    const { userId } = req.userContext;
    return this.service.batchReturn(body.instanceIds, userId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'publish')
  @NeedLogin()
  @Post('publish')
  async publish(@Req() req: Request, @Body() body: PublishRequest) {
    const { userId } = req.userContext;
    return this.service.publish(body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Patch('assessment-instances/:id/unlock')
  async unlock(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UnlockRequest,
  ) {
    const { userId } = req.userContext;
    return this.service.unlock(id, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'view')
  @NeedLogin()
  @Get('publish/employees/:employeeId/indicators')
  async getEmployeeSnapshot(
    @Param('employeeId') employeeId: string,
  ): Promise<EmployeeSnapshotResponse> {
    return this.service.getEmployeeSnapshot(employeeId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Patch('publish/employees/:employeeId/indicators')
  async adjustEmployeeSnapshot(
    @Req() req: Request,
    @Param('employeeId') employeeId: string,
    @Body() body: AdjustRequest,
  ) {
    const { userId } = req.userContext;
    return this.service.adjustEmployeeSnapshot(employeeId, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Delete('publish/employees/:employeeId/indicators')
  async deleteEmployeeSnapshot(@Param('employeeId') employeeId: string) {
    return this.service.deleteEmployeeSnapshot(employeeId);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('publish_management', 'view')
  @Get('assessment-instances/:id/unlock-history')
  async getUnlockHistory(@Param('id') id: string) {
    return this.service.getUnlockHistory(id);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('publish_management', 'view')
  @Get('assessment-instances/:id/indicators')
  async getInstanceIndicators(@Param('id') id: string) {
    return this.service.getInstanceIndicators(id);
  }
}
