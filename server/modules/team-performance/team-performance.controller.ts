import { Controller, Get, Post, Query, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { TeamPerformanceService } from './team-performance.service';
import { parsePeriodsQuery } from './periods-query';
import type { RemindRequest, RemindResponse } from '@shared/api.interface';

@Controller('api/team-performance')
export class TeamPerformanceController {
  constructor(
    private readonly teamPerformanceService: TeamPerformanceService,
  ) {}

  @RequirePermission('team_performance', 'view')
  @NeedLogin()
  @Get('overview')
  async getOverview(
    @Req() req: Request,
    @Query('periods') periods?: string | string[],
  ) {
    const { userId } = req.userContext;
    return this.teamPerformanceService.getOverview(
      userId,
      parsePeriodsQuery(periods),
    );
  }

  @RequirePermission('team_performance', 'view')
  @NeedLogin()
  @Get('subordinates')
  async getSubordinates(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('status') status?: string,
    @Query('periods') periods?: string | string[],
  ) {
    const { userId } = req.userContext;
    return this.teamPerformanceService.getSubordinates(
      userId,
      parseInt(page, 10) || 1,
      parseInt(pageSize, 10) || 10,
      status,
      parsePeriodsQuery(periods),
    );
  }

  @RequirePermission('team_performance', 'edit')
  @NeedLogin()
  @Post('remind')
  async remind(
    @Req() req: Request,
    @Body() body: RemindRequest,
  ): Promise<RemindResponse> {
    const { userId } = req.userContext;
    return this.teamPerformanceService.remind(userId, body);
  }
}
