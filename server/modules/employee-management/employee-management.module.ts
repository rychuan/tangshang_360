import { Module } from '@nestjs/common';
import { EmployeeManagementController } from './employee-management.controller';
import { EmployeeManagementService } from './employee-management.service';
import { EmployeeSnapshotModule } from '../employee-snapshot/employee-snapshot.module';

@Module({
  imports: [EmployeeSnapshotModule],
  controllers: [EmployeeManagementController],
  providers: [EmployeeManagementService],
  exports: [EmployeeManagementService],
})
export class EmployeeManagementModule {}