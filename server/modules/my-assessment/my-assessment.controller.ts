import { Controller, Get, Query, Req } from '@nestjs/common';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import type { Request } from 'express';
import { MyAssessmentService } from './my-assessment.service';
import type {
  MyAssessmentRecordsResponse,
  MyAssessmentTrendResponse,
  MyAssessmentSummary,
} from '@shared/api.interface';

@Controller('api/my-assessments')
export class MyAssessmentController {
  constructor(private readonly service: MyAssessmentService) {}

  @RequirePermission('my_assessments', 'view')
  @Get('years')
  async getYears(@Req() req: Request): Promise<string[]> {
    const { userId } = req.userContext;
    return this.service.getAvailableYears(userId);
  }

  @RequirePermission('my_assessments', 'view')
  @Get('summary')
  async getSummary(
    @Req() req: Request,
    @Query('year') year?: string,
  ): Promise<MyAssessmentSummary> {
    const { userId } = req.userContext;
    return this.service.summary(userId, year);
  }

  @RequirePermission('my_assessments', 'view')
  @Get('records')
  async getRecords(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('status') status?: string,
    @Query('periodStart') periodStart?: string,
    @Query('periodEnd') periodEnd?: string,
  ): Promise<MyAssessmentRecordsResponse> {
    const { userId } = req.userContext;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 10));
    return this.service.records(userId, p, ps, status, periodStart, periodEnd);
  }

  @RequirePermission('my_assessments', 'view')
  @Get('trend')
  async getTrend(
    @Req() req: Request,
    @Query('year') year?: string,
  ): Promise<MyAssessmentTrendResponse> {
    const { userId } = req.userContext;
    return this.service.trend(userId, year);
  }
}
