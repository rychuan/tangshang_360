import { Module } from '@nestjs/common';
import { EmployeeManagementController } from './employee-management.controller';
import { EmployeeManagementService } from './employee-management.service';
import { EmployeeSnapshotModule } from '../employee-snapshot/employee-snapshot.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';

@Module({
  imports: [EmployeeSnapshotModule, RoleManagerModule],
  controllers: [EmployeeManagementController],
  providers: [EmployeeManagementService],
  exports: [EmployeeManagementService],
})
export class EmployeeManagementModule {}