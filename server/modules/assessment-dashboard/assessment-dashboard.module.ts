import { Module } from '@nestjs/common';
import { AssessmentDashboardController } from './assessment-dashboard.controller';
import { AssessmentDashboardService } from './assessment-dashboard.service';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [EmployeeManagementModule, AccessScopeModule],
  controllers: [AssessmentDashboardController],
  providers: [AssessmentDashboardService],
  exports: [AssessmentDashboardService],
})
export class AssessmentDashboardModule {}
