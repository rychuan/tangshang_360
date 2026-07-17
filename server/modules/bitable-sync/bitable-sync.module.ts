import { Module } from '@nestjs/common';
import { BitableSyncController } from './bitable-sync.controller';
import { BitableSyncService } from './bitable-sync.service';
import { PerformanceSyncService } from './performance-sync.service';
import { AccessScopeModule } from '@server/common/access/access-scope.module';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';

@Module({
  imports: [AccessScopeModule, EmployeeManagementModule],
  controllers: [BitableSyncController],
  providers: [BitableSyncService, PerformanceSyncService],
})
export class BitableSyncModule {}
