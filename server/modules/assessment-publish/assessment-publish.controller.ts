import { Controller, Get, Post, Patch, Param, Query, Body, Req } from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { AssessmentPublishService } from './assessment-publish.service';
import type { PublishRequest, AdjustRequest, UnlockRequest, BatchUnlockRequest, BatchNotifyRequest } from '@shared/api.interface';

@Controller()
export class AssessmentPublishController {
  constructor(private readonly service: AssessmentPublishService) {}

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @Get('api/publish/employees')
  async listEmployees(
    @Query('period') period: string,
    @Query('department') department: string,
    @Query('templateId') templateId: string,
  ) {
    return this.service.listEmployees(period, department, templateId);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @Get('api/assessment-instances')
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

  @Get('api/publish/statistics')
  async getStatistics(@Query('period') period: string) {
    return this.service.getPeriodStatistics(period);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Patch('api/assessment-instances/batch-unlock')
  async batchUnlock(@Req() req: any, @Body() body: BatchUnlockRequest) {
    const { userId } = req.userContext;
    return this.service.batchUnlock(body.instanceIds, body.reason, userId);
  }

  @NeedLogin()
  @Post('api/assessment-instances/batch-notify')
  async batchNotify(@Req() req: any, @Body() body: BatchNotifyRequest) {
    const { userId } = req.userContext;
    return this.service.batchResendNotification(body.instanceIds, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Post('api/publish')
  async publish(@Req() req: any, @Body() body: PublishRequest) {
    const { userId } = req.userContext;
    return this.service.publish(body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Patch('api/assessment-instances/:id/adjust')
  async adjust(@Req() req: any, @Param('id') id: string, @Body() body: AdjustRequest) {
    const { userId } = req.userContext;
    return this.service.adjust(id, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @NeedLogin()
  @Patch('api/assessment-instances/:id/unlock')
  async unlock(@Req() req: any, @Param('id') id: string, @Body() body: UnlockRequest) {
    const { userId } = req.userContext;
    return this.service.unlock(id, body, userId);
  }

  @CanRole(['admin', 'hrd'])
  @Get('api/assessment-instances/:id/unlock-history')
  async getUnlockHistory(@Param('id') id: string) {
    return this.service.getUnlockHistory(id);
  }

  @Get('api/assessment-instances/:id/indicators')
  async getInstanceIndicators(@Param('id') id: string) {
    return this.service.getInstanceIndicators(id);
  }
}