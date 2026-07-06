import { Controller, Get, Post, Query, Body, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { TeamPerformanceService } from './team-performance.service';
import type { RemindRequest, RemindResponse } from '@shared/api.interface';

@Controller('api/team-performance')
export class TeamPerformanceController {
  constructor(
    private readonly teamPerformanceService: TeamPerformanceService,
  ) {}

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('team_performance', 'view')
  @Get('overview')
  async getOverview(@Req() req: Request, @Query('periods') periods?: string) {
    const { userId } = req.userContext;
    return this.teamPerformanceService.getOverview(
      userId,
      periods ? periods.split(',').filter(Boolean) : undefined,
    );
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('team_performance', 'view')
  @Get('subordinates')
  async getSubordinates(
    @Req() req: Request,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Query('status') status?: string,
    @Query('periods') periods?: string,
  ) {
    const { userId } = req.userContext;
    return this.teamPerformanceService.getSubordinates(
      userId,
      parseInt(page, 10) || 1,
      parseInt(pageSize, 10) || 10,
      status,
      periods ? periods.split(',').filter(Boolean) : undefined,
    );
  }

  @CanRole(['admin', 'dept_head', 'supervisor'])
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
