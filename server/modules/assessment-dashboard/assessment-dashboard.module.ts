import { Module } from '@nestjs/common';
import { AssessmentDashboardController } from './assessment-dashboard.controller';
import { AssessmentDashboardService } from './assessment-dashboard.service';
import { RoleManagerModule } from '../role-manager/role-manager.module';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';

@Module({
  imports: [RoleManagerModule, EmployeeManagementModule],
  controllers: [AssessmentDashboardController],
  providers: [AssessmentDashboardService],
  exports: [AssessmentDashboardService],
})
export class AssessmentDashboardModule {}
