import { Controller, Post } from '@nestjs/common';
import { CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { BitableSyncService } from './bitable-sync.service';
import type { BitablePluginSyncResponse } from '@shared/api.interface';

@Controller('api/bitable-sync')
export class BitableSyncController {
  constructor(private readonly syncService: BitableSyncService) {}

  @CanRole(['admin', 'hrd'])
  @Post('import')
  async importFromBitable(): Promise<BitablePluginSyncResponse> {
    return this.syncService.importFromBitable();
  }

  @CanRole(['admin', 'hrd'])
  @Post('export')
  async exportToBitable(): Promise<BitablePluginSyncResponse> {
    return this.syncService.exportToBitable();
  }
}
