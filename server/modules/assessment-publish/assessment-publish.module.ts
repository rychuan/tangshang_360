import { Module } from '@nestjs/common';
import { AssessmentPublishController } from './assessment-publish.controller';
import { AssessmentPublishService } from './assessment-publish.service';
import { UnlockService } from './unlock.service';
import { EmployeeSnapshotModule } from '../employee-snapshot/employee-snapshot.module';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [EmployeeSnapshotModule, AccessScopeModule],
  controllers: [AssessmentPublishController],
  providers: [AssessmentPublishService, UnlockService],
  exports: [AssessmentPublishService, UnlockService],
})
export class AssessmentPublishModule {}
