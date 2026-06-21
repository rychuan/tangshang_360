import { Module } from '@nestjs/common';
import { AssessmentDashboardController } from './assessment-dashboard.controller';
import { AssessmentDashboardService } from './assessment-dashboard.service';

@Module({
  controllers: [AssessmentDashboardController],
  providers: [AssessmentDashboardService],
  exports: [AssessmentDashboardService],
})
export class AssessmentDashboardModule {}