import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

export * as dashboard from './dashboard';
export * as assessmentTemplate from './assessment-template';
export * as teamStructure from './team-structure';
export * as assessmentPublish from './assessment-publish';
export * as assessmentOperation from './assessment-operation';
export * as assessmentStatistics from './assessment-statistics';
export * as myAssessment from './my-assessment';
export * as teamPerformance from './team-performance';
export * as department from './department';
export * as employeeManagement from './employee-management';
export * as roleManager from './role-manager';
export * as performanceGrade from './performance-grade';

export { default as dictionary } from './dictionary';
