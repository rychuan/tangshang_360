import { Module } from '@nestjs/common';
import { AssessmentStatisticsController } from './assessment-statistics.controller';
import { AssessmentStatisticsService } from './assessment-statistics.service';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [AccessScopeModule],
  controllers: [AssessmentStatisticsController],
  providers: [AssessmentStatisticsService],
  exports: [AssessmentStatisticsService],
})
export class AssessmentStatisticsModule {}
