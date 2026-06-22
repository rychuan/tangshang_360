import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Req } from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { AssessmentPublishService } from './assessment-publish.service';
import type { PublishRequest, AdjustRequest, UnlockRequest, BatchUnlockRequest, BatchNotifyRequest, EmployeeSnapshotResponse } from '@shared/api.interface';

@Controller('api')
export class AssessmentPublishController {
  constructor(private readonly service: AssessmentPublishService) {}

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @Get('publish/employees')
  async listEmployees(
    @Query('period') period: string,
    @Query('department') department: string,
    @Query('templateId') templateId: string,
  ) {
    return this.service.listEmployees(period, department, templateId);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @Get('assessment-instances')
  async listInstances(
    @Query('period') period: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('status') status: string,
    @Query('department') department: string,
    @Query('grade') grade: string,
  ) {
    return this.service.listInstances(period, page, pageSize, status, department, grade);
  }

  @Get('publish/statistics')
  async getStatistics(@Query('period') period: string) {
    return this.service.getPeriodStatistics(period);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Patch('assessment-instances/batch-unlock')
  async batchUnlock(@Req() req: any, @Body() body: BatchUnlockRequest) {
    const { userId } = req.userContext;
    return this.service.batchUnlock(body.instanceIds, body.reason, userId);
  }

  @NeedLogin()
  @Post('assessment-instances/batch-notify')
  async batchNotify(@Req() req: any, @Body() body: BatchNotifyRequest) {
    const { userId } = req.userContext;
    return this.service.batchResendNotification(body.instanceIds, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Post('publish')
  async publish(@Req() req: any, @Body() body: PublishRequest) {
    const { userId } = req.userContext;
    return this.service.publish(body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Patch('assessment-instances/:id/unlock')
  async unlock(@Req() req: any, @Param('id') id: string, @Body() body: UnlockRequest) {
    const { userId } = req.userContext;
    return this.service.unlock(id, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Get('publish/employees/:employeeId/indicators')
  async getEmployeeSnapshot(@Param('employeeId') employeeId: string): Promise<EmployeeSnapshotResponse> {
    return this.service.getEmployeeSnapshot(employeeId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Patch('publish/employees/:employeeId/indicators')
  async adjustEmployeeSnapshot(@Req() req: any, @Param('employeeId') employeeId: string, @Body() body: AdjustRequest) {
    const { userId } = req.userContext;
    return this.service.adjustEmployeeSnapshot(employeeId, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Delete('publish/employees/:employeeId/indicators')
  async deleteEmployeeSnapshot(@Param('employeeId') employeeId: string) {
    return this.service.deleteEmployeeSnapshot(employeeId);
  }

  @CanRole(['admin', 'hrd'])
  @Get('assessment-instances/:id/unlock-history')
  async getUnlockHistory(@Param('id') id: string) {
    return this.service.getUnlockHistory(id);
  }

  @Get('assessment-instances/:id/indicators')
  async getInstanceIndicators(@Param('id') id: string) {
    return this.service.getInstanceIndicators(id);
  }
}