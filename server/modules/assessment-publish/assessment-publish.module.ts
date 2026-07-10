import { Module } from '@nestjs/common';
import { AssessmentPublishController } from './assessment-publish.controller';
import { AssessmentPublishService } from './assessment-publish.service';
import { EmployeeSnapshotModule } from '../employee-snapshot/employee-snapshot.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';

@Module({
  imports: [EmployeeSnapshotModule, RoleManagerModule],
  controllers: [AssessmentPublishController],
  providers: [AssessmentPublishService],
  exports: [AssessmentPublishService],
})
export class AssessmentPublishModule {}
