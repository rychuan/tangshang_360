import { Module } from '@nestjs/common';
import { TeamPerformanceController } from './team-performance.controller';
import { TeamPerformanceService } from './team-performance.service';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [AccessScopeModule],
  controllers: [TeamPerformanceController],
  providers: [TeamPerformanceService],
  exports: [TeamPerformanceService],
})
export class TeamPerformanceModule {}
