import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { AssessmentTemplateModule } from './modules/assessment-template/assessment-template.module';
import { TeamStructureModule } from './modules/team-structure/team-structure.module';
import { AssessmentPublishModule } from './modules/assessment-publish/assessment-publish.module';
import { AssessmentOperationModule } from './modules/assessment-operation/assessment-operation.module';
import { AssessmentStatisticsModule } from './modules/assessment-statistics/assessment-statistics.module';
import { AssessmentDashboardModule } from './modules/assessment-dashboard/assessment-dashboard.module';
import { MyAssessmentModule } from './modules/my-assessment/my-assessment.module';
import { TeamPerformanceModule } from './modules/team-performance/team-performance.module';
import { DepartmentModule } from './modules/department/department.module';
import { EmployeeManagementModule } from './modules/employee-management/employee-management.module';
import { RoleManagerModule } from './modules/role-manager/role-manager.module';
import { PerformanceGradeModule } from './modules/performance-grade/performance-grade.module';
import { ViewModule } from './modules/view/view.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot(),
    // ====== @route-section: business-modules START ======
    AssessmentDashboardModule,
    AssessmentTemplateModule,
    TeamStructureModule,
    AssessmentPublishModule,
    AssessmentOperationModule,
    AssessmentStatisticsModule,
    MyAssessmentModule,
    TeamPerformanceModule,
    DepartmentModule,
    EmployeeManagementModule,
    RoleManagerModule,
    PerformanceGradeModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
