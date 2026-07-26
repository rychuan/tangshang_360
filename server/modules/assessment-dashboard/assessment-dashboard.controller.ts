import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { AssessmentDashboardService } from './assessment-dashboard.service';

@Controller('api/dashboard')
export class AssessmentDashboardController {
  constructor(private readonly service: AssessmentDashboardService) {}

  @RequirePermission('dashboard', 'view')
  @NeedLogin()
  @Get('todos')
  async todos(@Req() req: Request) {
    const { userId } = req.userContext as { userId: string };
    return this.service.todos(userId);
  }

  @RequirePermission('dashboard', 'view')
  @NeedLogin()
  @Get('overview')
  async overview(@Req() req: Request) {
    const { userId } = req.userContext as { userId: string };
    return this.service.overview(userId);
  }
}
