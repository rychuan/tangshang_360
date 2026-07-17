import { Module } from '@nestjs/common';
import { EmployeeManagementController } from './employee-management.controller';
import { EmployeeManagementService } from './employee-management.service';
import { EmployeeBindingService } from './employee-binding.service';
import { EmployeeRepository } from './employee.repository';
import { EmployeeSnapshotModule } from '../employee-snapshot/employee-snapshot.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [EmployeeSnapshotModule, RoleManagerModule, AccessScopeModule],
  controllers: [EmployeeManagementController],
  providers: [
    EmployeeManagementService,
    EmployeeBindingService,
    EmployeeRepository,
  ],
  exports: [
    EmployeeManagementService,
    EmployeeBindingService,
    EmployeeRepository,
  ],
})
export class EmployeeManagementModule {}
