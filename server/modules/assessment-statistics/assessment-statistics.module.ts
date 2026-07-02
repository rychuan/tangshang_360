import { Module } from '@nestjs/common';
import { AssessmentStatisticsController } from './assessment-statistics.controller';
import { AssessmentStatisticsService } from './assessment-statistics.service';

@Module({
  controllers: [AssessmentStatisticsController],
  providers: [AssessmentStatisticsService],
  exports: [AssessmentStatisticsService],
})
export class AssessmentStatisticsModule {}