import { Module } from '@nestjs/common';
import { BitableSyncController } from './bitable-sync.controller';
import { BitableSyncService } from './bitable-sync.service';
import { PerformanceSyncService } from './performance-sync.service';

@Module({
  controllers: [BitableSyncController],
  providers: [BitableSyncService, PerformanceSyncService],
})
export class BitableSyncModule {}
