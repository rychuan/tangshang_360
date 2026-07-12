import { Module } from '@nestjs/common';
import { AssessmentOperationController } from './assessment-operation.controller';
import { AssessmentOperationService } from './assessment-operation.service';
import { PerformanceGradeModule } from '../performance-grade/performance-grade.module';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [PerformanceGradeModule, AccessScopeModule],
  controllers: [AssessmentOperationController],
  providers: [AssessmentOperationService],
  exports: [AssessmentOperationService],
})
export class AssessmentOperationModule {}
