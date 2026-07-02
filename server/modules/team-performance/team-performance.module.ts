import { Module } from '@nestjs/common';
import { TeamPerformanceController } from './team-performance.controller';
import { TeamPerformanceService } from './team-performance.service';

@Module({
  controllers: [TeamPerformanceController],
  providers: [TeamPerformanceService],
  exports: [TeamPerformanceService],
})
export class TeamPerformanceModule {}