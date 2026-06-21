import { Module } from '@nestjs/common';
import { PerformanceGradeController } from './performance-grade.controller';
import { PerformanceGradeService } from './performance-grade.service';

@Module({
  controllers: [PerformanceGradeController],
  providers: [PerformanceGradeService],
  exports: [PerformanceGradeService],
})
export class PerformanceGradeModule {}
