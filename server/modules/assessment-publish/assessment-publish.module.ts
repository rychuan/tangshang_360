import { Module } from '@nestjs/common';
import { AssessmentPublishController } from './assessment-publish.controller';
import { AssessmentPublishService } from './assessment-publish.service';
import { EmployeeSnapshotModule } from '../employee-snapshot/employee-snapshot.module';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [EmployeeSnapshotModule, AccessScopeModule],
  controllers: [AssessmentPublishController],
  providers: [AssessmentPublishService],
  exports: [AssessmentPublishService],
})
export class AssessmentPublishModule {}
