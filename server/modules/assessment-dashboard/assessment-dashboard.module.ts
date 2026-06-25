import { Module } from '@nestjs/common';
import { AssessmentDashboardController } from './assessment-dashboard.controller';
import { AssessmentDashboardService } from './assessment-dashboard.service';
import { RoleManagerModule } from '../role-manager/role-manager.module';

@Module({
  imports: [RoleManagerModule],
  controllers: [AssessmentDashboardController],
  providers: [AssessmentDashboardService],
  exports: [AssessmentDashboardService],
})
export class AssessmentDashboardModule {}