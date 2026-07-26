import { Controller, Get, Query, Req } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import {
  AssessmentStatisticsService,
  type RecordsQuery,
  type ChartsQuery,
  type ExportQuery,
} from './assessment-statistics.service';
import type { ExportResult } from '@shared/api.interface';
import type { Request } from 'express';

@Controller('api/statistics')
export class AssessmentStatisticsController {
  constructor(private readonly service: AssessmentStatisticsService) {}

  @RequirePermission('statistics', 'view')
  @NeedLogin()
  @Get('records')
  async records(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('periods') periods: string,
    @Query('departments') departments: string,
    @Query('positions') positions: string,
    @Query('grades') grades: string,
    @Query('employeeIds') employeeIds: string,
  ) {
    const query: RecordsQuery = {
      page: parseInt(page, 10) || 1,
      pageSize: Math.min(parseInt(pageSize, 10) || 20, 50),
      periods: periods ? periods.split(',').filter(Boolean) : undefined,
      departments: departments
        ? departments.split(',').filter(Boolean)
        : undefined,
      positions: positions ? positions.split(',').filter(Boolean) : undefined,
      grades: grades ? grades.split(',').filter(Boolean) : undefined,
      employeeIds: employeeIds
        ? employeeIds.split(',').filter(Boolean)
        : undefined,
    };
    const { userId } = req.userContext;
    return this.service.records(query, userId);
  }

  @RequirePermission('statistics', 'view')
  @NeedLogin()
  @Get('charts')
  async charts(
    @Req() req: Request,
    @Query('periods') periods: string,
    @Query('departments') departments: string,
    @Query('positions') positions: string,
    @Query('grades') grades: string,
  ) {
    const query: ChartsQuery = {
      periods: periods ? periods.split(',').filter(Boolean) : undefined,
      departments: departments
        ? departments.split(',').filter(Boolean)
        : undefined,
      positions: positions ? positions.split(',').filter(Boolean) : undefined,
      grades: grades ? grades.split(',').filter(Boolean) : undefined,
    };
    const { userId } = req.userContext;
    return this.service.charts(query, userId);
  }

  @RequirePermission('statistics', 'export')
  @NeedLogin()
  @Get('export')
  async exportData(
    @Req() req: Request,
    @Query('periods') periods: string,
    @Query('departments') departments: string,
    @Query('positions') positions: string,
    @Query('grades') grades: string,
    @Query('employeeIds') employeeIds: string,
  ): Promise<ExportResult> {
    const query: ExportQuery = {
      periods: periods ? periods.split(',').filter(Boolean) : undefined,
      departments: departments
        ? departments.split(',').filter(Boolean)
        : undefined,
      positions: positions ? positions.split(',').filter(Boolean) : undefined,
      grades: grades ? grades.split(',').filter(Boolean) : undefined,
      employeeIds: employeeIds
        ? employeeIds.split(',').filter(Boolean)
        : undefined,
    };
    const { userId } = req.userContext;
    return this.service.exportData(query, userId);
  }
}
