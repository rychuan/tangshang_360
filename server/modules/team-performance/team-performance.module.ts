import { Module } from '@nestjs/common';
import { TeamPerformanceController } from './team-performance.controller';
import { TeamPerformanceService } from './team-performance.service';
import { AccessScopeModule } from '@server/common/access/access-scope.module';
import { AssessmentPublishModule } from '../assessment-publish/assessment-publish.module';

@Module({
  imports: [AccessScopeModule, AssessmentPublishModule],
  controllers: [TeamPerformanceController],
  providers: [TeamPerformanceService],
  exports: [TeamPerformanceService],
})
export class TeamPerformanceModule {}
