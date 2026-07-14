import type {
  MemberMutationData,
  FilterParams,
} from '@lark-apaas/fullstack-nestjs-core';

export interface AssessmentTemplateItem {
  id: string;
  name: string;
  position: string;
  type: 'monthly' | 'probation';
  isActive: boolean;
  createdAt: string;
  dimensionCount: number;
  indicatorCount: number;
}
export interface AssessmentTemplateListResponse {
  items: AssessmentTemplateItem[];
  total: number;
}
export interface AssessmentIndicatorDef {
  id: string;
  content: string;
  description: string;
  algorithm: string;
  dataSource: string;
  weight: number;
}
export interface AssessmentDimensionDef {
  id: string;
  name: string;
  weight: number;
  indicators: AssessmentIndicatorDef[];
}
export interface AssessmentTemplateDetail {
  id: string;
  name: string;
  position: string;
  type: 'monthly' | 'probation';
  isActive: boolean;
  dimensions: AssessmentDimensionDef[];
}
export interface CreateTemplateRequest {
  name: string;
  position: string;
  type: 'monthly' | 'probation';
  dimensions: Array<{
    name: string;
    weight: number;
    indicators: Array<{
      content: string;
      description: string;
      algorithm: string;
      dataSource: string;
      weight: number;
    }>;
  }>;
}
export interface UpdateTemplateRequest extends CreateTemplateRequest {}
export interface CreateBindingRequest {
  employeeIds: string[];
  templateId: string;
  effectiveFrom: string;
}
export interface BindingHistoryItem {
  templateName: string;
  effectiveFrom: string;
  status: boolean;
  operatedBy: string;
  operatedAt: string;
}
export interface EmployeeBindingHistoryResponse {
  items: BindingHistoryItem[];
}
export interface TeamStructureItem {
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  supervisorId: string;
  supervisorName: string;
  templateId: string | null;
  templateName: string | null;
  bindingId: string | null;
  effectiveFrom: string | null;
  bindingStatus: string | null;
}
export interface TeamStructureListResponse {
  items: TeamStructureItem[];
  total: number;
}
export interface PublishEmployeeItem {
  employeeId: string;
  employeeName: string;
  position: string;
  department: string;
  templateId: string;
  templateName: string;
  lastPeriodStatus?: string;
}
export interface PublishRequest {
  period: string;
  employeeIds?: string[];
  appBaseUrl: string;
}
export interface AssessmentInstanceItem {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  supervisorId?: string;
  supervisorName: string;
  status: string;
  totalScore?: number;
  grade?: string;
  publishedAt: string;
  publishedById?: string;
  publishedByName: string;
  selfReviewCompleted: boolean;
  supervisorReviewCompleted: boolean;
}
export interface AssessmentInstanceListParams {
  period: string;
  page: number;
  pageSize: number;
  status?: string;
  department?: string;
  grade?: string;
}
export interface AssessmentInstanceListResponse {
  items: AssessmentInstanceItem[];
  total: number;
}
export interface AssessmentIndicatorDetail {
  id: string;
  dimensionName: string;
  dimensionWeight: number;
  content: string;
  description: string;
  algorithm: string;
  dataSource: string;
  weight: number;
  selfScore?: number;
  selfCompletionStatus?: string;
  selfComment?: string;
  supervisorScore?: number;
  supervisorComment?: string;
}

export interface AssessmentInstanceDetail {
  id: string;
  period: string;
  employeeId: string;
  employeeName: string;
  position: string;
  supervisorId: string;
  supervisorName: string;
  status: string;
  totalScore?: number;
  grade?: string;
  coefficient?: string;
  selfSignName?: string;
  selfSignAt?: string;
  selfSignImage?: string;
  supervisorSignName?: string;
  supervisorSignAt?: string;
  supervisorSignImage?: string;
  canSupervisorOperate: boolean;
  indicators: AssessmentIndicatorDetail[];
}
export interface RatingSubmitRequest {
  isDraft: boolean;
  ratings: Array<{
    indicatorSnapshotId: string;
    score?: number;
    completionStatus?: string;
    comment?: string;
  }>;
}
export interface SupervisorRatingResponse {
  success: boolean;
  totalScore: number;
  grade: string;
}
export interface SignRequest {
  signType: 'self' | 'supervisor';
  signName: string;
  signImage?: string;
}
export interface RatingSubmitWithSignRequest extends RatingSubmitRequest {
  signName: string;
  signImage?: string;
}
export interface DashboardTodosResponse {
  items: Array<{
    id: string;
    period: string;
    type: 'self_review' | 'supervisor_review';
    title: string;
    deadline?: string;
  }>;
}
export interface DashboardOverviewResponse {
  stats: {
    pendingCount: number;
    completedCount: number;
    avgScore?: number;
    gradeDistribution?: Record<string, number>;
    trend?: Array<{ month: string; score: number }>;
  };
  shortcuts: Array<{
    title: string;
    path: string;
  }>;
}
export interface StatisticsRecordItem {
  id: string;
  period: string;
  employeeName: string;
  department: string;
  position: string;
  supervisorName: string;
  totalScore: number;
  grade: string;
  status: string;
  completedAt?: string;
}
export interface StatisticsRecordsResponse {
  items: StatisticsRecordItem[];
  total: number;
}
export interface ChartsResponse {
  gradeDistribution: Array<{ grade: string; count: number }>;
  departmentAvg: Array<{ department: string; avgScore: number }>;
  trend: Array<{ month: string; avgScore: number }>;
  positionAvg: Array<{ position: string; avgScore: number }>;
}
export interface SuccessResponse {
  success: boolean;
}
export interface PublishResponse {
  success: boolean;
  publishedCount: number;
}
export interface AdjustIndicatorInput {
  content: string;
  description: string;
  algorithm: string;
  dataSource: string;
  weight: number;
  dimensionName: string;
  dimensionWeight: number;
}
export interface AdjustRequest {
  indicators: AdjustIndicatorInput[];
}
export interface UnlockRequest {
  reason: string;
}
export interface BatchUnlockRequest {
  instanceIds: string[];
  reason: string;
}
export interface BatchReturnRequest {
  instanceIds: string[];
}
export interface BatchOperationResponse {
  success: boolean;
  successCount: number;
  failedCount: number;
}
export interface ReminderPreviewResponse {
  taskCount: number;
  employeeCount: number;
  supervisorCount: number;
  expectedMessageCount: number;
  missingSupervisorCount: number;
}
export interface UnfinishedReminderRequest {
  period: string;
  department?: string;
  status?: string;
  grade?: string;
  appBaseUrl: string;
}
export interface UnfinishedReminderResponse extends ReminderPreviewResponse {
  success: boolean;
  sentCount: number;
  failedCount: number;
}
export interface UnlockHistoryItem {
  id: string;
  operatorName: string;
  fromStatus: string;
  toStatus: string;
  reason: string;
  createdAt: string;
}
export interface PeriodStatisticsResponse {
  toPublishCount: number;
  publishedCount: number;
  selfReviewCompletedRate: number;
  pendingCount: number;
}
export interface InstanceIndicatorItem {
  content: string;
  description: string;
  algorithm: string;
  dataSource: string;
  weight: number;
  dimensionName?: string;
  dimensionWeight?: number;
}
export interface InstanceIndicatorsResponse {
  indicators: InstanceIndicatorItem[];
}
export interface EmployeeSnapshotResponse {
  indicators: InstanceIndicatorItem[];
  hasSnapshot: boolean;
  templateId: string;
  templateName: string;
}
export interface EmployeeCurrentBinding {
  bindingId: string;
  templateId: string;
  templateName: string;
  effectiveFrom: string;
  status: boolean;
}
export interface EmployeeItem {
  id: string;
  employeeNo: string;
  name: string;
  position: string;
  title: string;
  role: 'admin' | 'hrd' | 'dept_head' | 'supervisor' | 'employee';
  department: string;
  supervisorId: string;
  supervisorName: string;
  status: boolean;
  phone: string;
  hireDate: string;
  currentBinding?: EmployeeCurrentBinding | null;
  bitableConnectionId?: string | null;
}
export interface EmployeeDetail extends EmployeeItem {
  probationMonths: number;
  createdAt: string;
  stats: {
    activeBindings: number;
    totalAssessments: number;
    completedAssessments: number;
    avgScore?: number;
    latestGrade?: string;
  };
}
export interface EmployeeListResponse {
  items: EmployeeItem[];
  total: number;
  page?: number;
  pageSize?: number;
}
export interface CreateEmployeeRequest {
  id: string;
  employeeNo?: string;
  name: string;
  position: string;
  positionCode?: string;
  title?: string;
  role?: 'admin' | 'hrd' | 'dept_head' | 'supervisor' | 'employee';
  department?: string;
  departmentId?: string;
  supervisorId?: string;
  phone?: string;
  hireDate?: string;
  probationMonths?: number;
}
export type UpdateEmployeeRequest = Omit<CreateEmployeeRequest, 'id'>;
export interface TeamEmployeeDetail {
  employeeId: string;
  name: string;
  position: string;
  department: string;
  supervisorId: string;
  supervisorName: string;
  status: boolean;
  bindingId: string | null;
  templateId: string | null;
  templateName: string | null;
  effectiveFrom: string | null;
}
export interface TeamUpdateEmployeeRequest {
  name?: string;
  position?: string;
  department?: string;
  supervisorId?: string;
  status?: boolean;
  employeeNo?: string;
  title?: string;
  role?: string;
  phone?: string;
  hireDate?: string;
  probationMonths?: number;
}
export interface BatchDeactivateRequest {
  employeeIds: string[];
}
export interface CreateResponse {
  id: string;
}
export interface TeamOverviewResponse {
  totalSubordinates: number;
  waitingSelfReview: number;
  readyForSupervisorReview: number;
  completedCount: number;
  totalInstanceCount: number;
  avgScore?: number;
  gradeDistribution?: Record<string, number>;
  pendingSelfCount?: number;
  pendingSupervisorCount?: number;
}
export interface SubordinateRecord {
  id: string;
  period: string;
  employeeId: string;
  employeeName: string;
  department: string;
  position: string;
  status: string;
  totalScore?: number;
  grade?: string;
}
export interface SubordinatesResponse {
  items: SubordinateRecord[];
  total: number;
  page: number;
  pageSize: number;
}
export interface RemindRequest {
  instanceIds: string[];
}
export interface MyAssessmentRecordItem {
  id: string;
  period: string;
  position: string;
  totalScore?: number;
  grade?: string;
  status: string;
  selfSignAt?: string;
  supervisorSignAt?: string;
  completedAt?: string;
  createdAt: string;
}
export interface MyAssessmentRecordsResponse {
  items: MyAssessmentRecordItem[];
  total: number;
}
export interface MyAssessmentTrendResponse {
  items: Array<{ period: string; avgScore: number | null }>;
}
export interface MyAssessmentSummary {
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  avgScore: number;
  latestGrade?: string;
}
export interface RemindResult {
  instanceId: string;
  status: 'sent' | 'failed';
  reason?: string;
}
export interface RemindResponse {
  success: boolean;
  results: RemindResult[];
}
// === Permission Management ===
export type PermissionAction =
  | 'view'
  | 'edit'
  | 'delete'
  | 'export'
  | 'publish';
export type PermissionResource =
  | 'my_assessments'
  | 'employees'
  | 'template_management'
  | 'organization'
  | 'employee_binding'
  | 'publish_management'
  | 'statistics'
  | 'team_performance'
  | 'permission_management'
  | 'grade_config'
  | 'dictionary_config';
export interface PermissionItem {
  resource: PermissionResource;
  actions: PermissionAction[];
}
export const DEFAULT_PERMISSIONS: Record<string, PermissionItem[]> = {
  admin: [
    { resource: 'my_assessments', actions: ['view', 'edit'] },
    { resource: 'employees', actions: ['view', 'edit', 'delete'] },
    { resource: 'template_management', actions: ['view', 'edit', 'delete'] },
    { resource: 'employee_binding', actions: ['view', 'edit'] },
    { resource: 'publish_management', actions: ['view', 'edit', 'publish'] },
    { resource: 'statistics', actions: ['view', 'export'] },
    { resource: 'team_performance', actions: ['view'] },
    { resource: 'organization', actions: ['view', 'edit', 'delete'] },
    { resource: 'permission_management', actions: ['view', 'edit'] },
    { resource: 'grade_config', actions: ['view', 'edit'] },
    { resource: 'dictionary_config', actions: ['view', 'edit'] },
  ],
  hrd: [
    { resource: 'my_assessments', actions: ['view'] },
    { resource: 'employees', actions: ['view'] },
    { resource: 'template_management', actions: ['view', 'edit', 'delete'] },
    { resource: 'employee_binding', actions: ['view', 'edit'] },
    { resource: 'publish_management', actions: ['view', 'edit', 'publish'] },
    { resource: 'statistics', actions: ['view', 'export'] },
    { resource: 'team_performance', actions: ['view'] },
    { resource: 'organization', actions: ['view', 'edit'] },
    { resource: 'permission_management', actions: ['view'] },
    { resource: 'grade_config', actions: ['view', 'edit'] },
    { resource: 'dictionary_config', actions: ['view', 'edit'] },
  ],
  dept_head: [
    { resource: 'my_assessments', actions: ['view'] },
    { resource: 'employees', actions: ['view'] },
    { resource: 'template_management', actions: ['view'] },
    { resource: 'employee_binding', actions: ['view'] },
    { resource: 'publish_management', actions: ['view'] },
    { resource: 'statistics', actions: ['view', 'export'] },
    { resource: 'organization', actions: ['view', 'edit'] },
    { resource: 'team_performance', actions: ['view', 'edit'] },
  ],
  supervisor: [
    { resource: 'my_assessments', actions: ['view', 'edit'] },
    { resource: 'employees', actions: ['view'] },
    { resource: 'statistics', actions: ['view'] },
    { resource: 'team_performance', actions: ['view', 'edit'] },
  ],
  employee: [{ resource: 'my_assessments', actions: ['view', 'edit'] }],
};
// === Role Management (AuthorizationSDK) ===
export type {
  ForceRoleDTO,
  RoleMemberDTO,
  MemberMutationData,
  MemberType,
  UserSimpleDTO,
  DepartmentDTO,
  ChatSimpleDTO,
  PresetGroupDTO,
  SearchResponse,
  SearchResult,
  FilterParams,
  I18nText,
  ListMembersResponse,
  CreateRoleResponse,
} from '@lark-apaas/fullstack-nestjs-core';

export interface CreateRoleRequest {
  role: { name: string; description?: string; bizID: string };
}

export interface UpdateRoleRequest {
  role: { name?: string; description?: string };
}

export interface AddMembersRequest {
  members: import('@lark-apaas/fullstack-nestjs-core').MemberMutationData;
}

export interface RemoveMembersRequest {
  members: import('@lark-apaas/fullstack-nestjs-core').MemberMutationData;
}

export interface SearchMembersRequest {
  query: string;
  filters?: import('@lark-apaas/fullstack-nestjs-core').FilterParams;
  pageSize?: number;
  page?: number;
}

export interface RolePermissionConfig {
  roleBizId: string;
  permissions: PermissionItem[];
}

export interface UpdateRolePermissionsRequest {
  permissions: PermissionItem[];
}

export const BUILTIN_ROLE_CODES = [
  'admin',
  'hrd',
  'dept_head',
  'supervisor',
  'employee',
] as const;

export const ROLE_OPTIONS = [
  'admin',
  'hrd',
  'dept_head',
  'supervisor',
  'employee',
] as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: '系统管理员',
  hrd: '人力资源总监',
  dept_head: '部门负责人',
  supervisor: '直属上级',
  employee: '普通员工',
};

// === Department & Organization ===
export interface DepartmentItem {
  id: string;
  name: string;
  parentId: string;
  parentName: string;
  headId: string;
  headName: string;
  memberCount: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}
export interface DepartmentTreeNode extends DepartmentItem {
  children: DepartmentTreeNode[];
}
export interface DepartmentListResponse {
  items: DepartmentItem[];
  tree: DepartmentTreeNode[];
}
export interface CreateDepartmentRequest {
  name: string;
  parentId?: string;
  headId?: string;
  sortOrder?: number;
}
export type UpdateDepartmentRequest = CreateDepartmentRequest;

// === Dictionary Management ===
export interface DictEntry {
  id: string;
  dictType: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}
export interface DictListResponse {
  items: DictEntry[];
}
export interface CreateDictRequest {
  code?: string;
  name: string;
  sortOrder?: number;
}
export type UpdateDictRequest = CreateDictRequest;

export interface ExportResultItem extends StatisticsRecordItem {}
export interface ExportResult {
  items: ExportResultItem[];
  total: number;
  exportedCount: number;
  isTruncated: boolean;
}

// === Performance Grade Configuration ===
export interface PerformanceGradeItem {
  id: string;
  name: string;
  minScore: number;
  maxScore: number;
  coefficient?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}
export interface PerformanceGradeListResponse {
  items: PerformanceGradeItem[];
}
export interface ActiveGradeRule {
  name: string;
  minScore: number;
  maxScore: number;
}
export interface ActiveGradeListResponse {
  rules: ActiveGradeRule[];
}
export interface CreatePerformanceGradeRequest {
  name: string;
  minScore: number;
  maxScore: number;
  coefficient?: string;
  sortOrder: number;
  isActive: boolean;
}
export interface UpdatePerformanceGradeRequest extends CreatePerformanceGradeRequest {}

// === Bitable Connection ===

export interface BitableConnectionItem {
  id: string;
  name: string;
  bitableAppToken: string;
  tableId: string;
  isActive: boolean;
  lastSyncAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BitableConnectionListResponse {
  items: BitableConnectionItem[];
  total: number;
}

export interface CreateBitableConnectionRequest {
  name: string;
  appId: string;
  appSecret: string;
  bitableAppToken: string;
  tableId: string;
}

export interface BitableSyncLogItem {
  id: string;
  direction: 'import' | 'export';
  status: 'success' | 'partial' | 'failed';
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  errorMessage?: string;
  operatorName: string;
  startedAt: string;
  completedAt?: string;
}

export interface BitableSyncLogDetail extends BitableSyncLogItem {
  details: Array<{
    row: number;
    employeeNo: string;
    name: string;
    status: 'created' | 'updated' | 'skipped' | 'failed';
    reason?: string;
  }>;
}

export interface BitableSyncLogListResponse {
  items: BitableSyncLogItem[];
  total: number;
}

export interface BitableImportResponse {
  success: boolean;
  connectionId: string;
  connectionName: string;
  totalCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  logId: string;
}

export interface BitableExportResponse {
  success: boolean;
  connectionId: string;
  totalCount: number;
  syncedCount: number;
  failedCount: number;
  logId: string;
}

export interface BitablePluginSyncResponse {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  message: string;
}
