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
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { AssessmentPublishService } from './assessment-publish.service';
import type { Request } from 'express';
import type {
  PublishRequest,
  AdjustRequest,
  UnlockRequest,
  BatchUnlockRequest,
  BatchReturnRequest,
  PublishExportRequest,
  UnfinishedReminderRequest,
  EmployeeSnapshotResponse,
} from '@shared/api.interface';

@Controller('api')
export class AssessmentPublishController {
  constructor(private readonly service: AssessmentPublishService) {}

  @RequirePermission('publish_management', 'view')
  @Get('publish/employees')
  async listEmployees(
    @Req() req: Request,
    @Query('periods') periods: string,
    @Query('department') department: string,
    @Query('templateId') templateId: string,
  ) {
    const { userId } = req.userContext;
    const periodList = periods ? periods.split(',').filter(Boolean) : [];
    return this.service.listEmployees(
      periodList,
      department,
      templateId,
      userId,
    );
  }

  @RequirePermission('publish_management', 'export')
  @NeedLogin()
  @Post('assessment-instances/export')
  async exportInstances(
    @Req() req: Request,
    @Body() body: PublishExportRequest,
  ) {
    const { userId } = req.userContext;
    return this.service.exportInstances(body.instanceIds, userId);
  }

  @RequirePermission('publish_management', 'view')
  @Get('assessment-instances')
  async listInstances(
    @Req() req: Request,
    @Query('periods') periods: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('status') status: string,
    @Query('department') department: string,
    @Query('grade') grade: string,
  ) {
    const { userId } = req.userContext;
    const periodList = periods ? periods.split(',').filter(Boolean) : [];
    return this.service.listInstances(
      periodList,
      page,
      pageSize,
      status,
      department,
      grade,
      userId,
    );
  }

  @RequirePermission('publish_management', 'view')
  @Get('publish/statistics')
  async getStatistics(@Req() req: Request, @Query('periods') periods: string) {
    const { userId } = req.userContext;
    const periodList = periods ? periods.split(',').filter(Boolean) : [];
    return this.service.getPeriodStatistics(periodList, userId);
  }

  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Patch('assessment-instances/batch-unlock')
  async batchUnlock(@Req() req: Request, @Body() body: BatchUnlockRequest) {
    const { userId } = req.userContext;
    return this.service.batchUnlock(body.instanceIds, body.reason, userId);
  }

  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Get('assessment-instances/reminder-preview')
  async reminderPreview(
    @Req() req: Request,
    @Query('periods') periods: string,
    @Query('department') department: string,
    @Query('status') status: string,
    @Query('grade') grade: string,
  ) {
    const { userId } = req.userContext;
    const periodList = periods ? periods.split(',').filter(Boolean) : [];
    return this.service.previewUnfinishedReminders(
      periodList,
      department,
      status,
      grade,
      userId,
    );
  }

  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Post('assessment-instances/remind-unfinished')
  async remindUnfinished(
    @Req() req: Request,
    @Body() body: UnfinishedReminderRequest,
  ) {
    const { userId } = req.userContext;
    return this.service.remindUnfinishedAssessments(body, userId);
  }

  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Post('assessment-instances/batch-return')
  async batchReturn(@Req() req: Request, @Body() body: BatchReturnRequest) {
    const { userId } = req.userContext;
    return this.service.batchReturn(body.instanceIds, userId);
  }

  @RequirePermission('publish_management', 'publish')
  @NeedLogin()
  @Post('publish')
  async publish(@Req() req: Request, @Body() body: PublishRequest) {
    const { userId } = req.userContext;
    return this.service.publish(body, userId);
  }

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

  @RequirePermission('publish_management', 'view')
  @NeedLogin()
  @Get('publish/employees/:employeeId/indicators')
  async getEmployeeSnapshot(
    @Param('employeeId') employeeId: string,
  ): Promise<EmployeeSnapshotResponse> {
    return this.service.getEmployeeSnapshot(employeeId);
  }

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

  @RequirePermission('publish_management', 'edit')
  @NeedLogin()
  @Delete('publish/employees/:employeeId/indicators')
  async deleteEmployeeSnapshot(@Param('employeeId') employeeId: string) {
    return this.service.deleteEmployeeSnapshot(employeeId);
  }

  @RequirePermission('publish_management', 'view')
  @Get('assessment-instances/:id/unlock-history')
  async getUnlockHistory(@Param('id') id: string) {
    return this.service.getUnlockHistory(id);
  }

  @RequirePermission('publish_management', 'view')
  @Get('assessment-instances/:id/indicators')
  async getInstanceIndicators(@Param('id') id: string) {
    return this.service.getInstanceIndicators(id);
  }
}
