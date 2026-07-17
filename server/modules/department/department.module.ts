import { Module } from '@nestjs/common';
import { DepartmentController } from './department.controller';
import { DepartmentService } from './department.service';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [EmployeeManagementModule, RoleManagerModule, AccessScopeModule],
  controllers: [DepartmentController],
  providers: [DepartmentService],
  exports: [DepartmentService],
})
export class DepartmentModule {}
