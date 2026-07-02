import { Module } from '@nestjs/common';
import { AssessmentPublishController } from './assessment-publish.controller';
import { AssessmentPublishService } from './assessment-publish.service';
import { EmployeeSnapshotModule } from '../employee-snapshot/employee-snapshot.module';

@Module({
  imports: [EmployeeSnapshotModule],
  controllers: [AssessmentPublishController],
  providers: [AssessmentPublishService],
  exports: [AssessmentPublishService],
})
export class AssessmentPublishModule {}