import { Controller, Post } from '@nestjs/common';
import { CanRole, NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { BitableSyncService } from './bitable-sync.service';
import { PerformanceSyncService } from './performance-sync.service';
import type { BitablePluginSyncResponse } from '@shared/api.interface';

@Controller('api/bitable-sync')
export class BitableSyncController {
  constructor(
    private readonly syncService: BitableSyncService,
    private readonly performanceSyncService: PerformanceSyncService,
  ) {}

  @CanRole(['admin', 'hrd'])
  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Post('import')
  async importFromBitable(): Promise<BitablePluginSyncResponse> {
    return this.syncService.importFromBitable();
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('employees', 'edit')
  @NeedLogin()
  @Post('export')
  async exportToBitable(): Promise<BitablePluginSyncResponse> {
    return this.syncService.exportToBitable();
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('statistics', 'export')
  @NeedLogin()
  @Post('performance-export')
  async exportPerformanceToBitable(): Promise<BitablePluginSyncResponse> {
    return this.performanceSyncService.exportToBitable();
  }
}
