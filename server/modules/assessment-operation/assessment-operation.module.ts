import { Module } from '@nestjs/common';
import { AssessmentOperationController } from './assessment-operation.controller';
import { AssessmentOperationService } from './assessment-operation.service';
import { PerformanceGradeModule } from '../performance-grade/performance-grade.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';

@Module({
  imports: [PerformanceGradeModule, RoleManagerModule],
  controllers: [AssessmentOperationController],
  providers: [AssessmentOperationService],
  exports: [AssessmentOperationService],
})
export class AssessmentOperationModule {}
