import { Module } from '@nestjs/common';
import { BitableSyncController } from './bitable-sync.controller';
import { BitableSyncService } from './bitable-sync.service';
import { PerformanceSyncService } from './performance-sync.service';
import { RoleManagerModule } from '../role-manager/role-manager.module';

@Module({
  imports: [RoleManagerModule],
  controllers: [BitableSyncController],
  providers: [BitableSyncService, PerformanceSyncService],
})
export class BitableSyncModule {}
