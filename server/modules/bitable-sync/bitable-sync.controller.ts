import { Controller, Post, Req } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { BitableSyncService } from './bitable-sync.service';
import { PerformanceSyncService } from './performance-sync.service';
import type { BitablePluginSyncResponse } from '@shared/api.interface';
import type { Request } from 'express';

@Controller('api/bitable-sync')
export class BitableSyncController {
  constructor(
    private readonly syncService: BitableSyncService,
    private readonly performanceSyncService: PerformanceSyncService,
  ) {}

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Post('import')
  async importFromBitable(
    @Req() req: Request,
  ): Promise<BitablePluginSyncResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.syncService.importFromBitable(userId);
  }

  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Post('export')
  async exportToBitable(
    @Req() req: Request,
  ): Promise<BitablePluginSyncResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.syncService.exportToBitable(userId);
  }

  @RequirePermission('statistics', 'export')
  @NeedLogin()
  @Post('performance-export')
  async exportPerformanceToBitable(
    @Req() req: Request,
  ): Promise<BitablePluginSyncResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.performanceSyncService.exportToBitable(userId);
  }
}
