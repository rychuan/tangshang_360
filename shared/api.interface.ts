export {
  type AssessmentTemplateItem,
  type AssessmentTemplateListResponse,
  type AssessmentIndicatorDef,
  type AssessmentDimensionDef,
  type AssessmentTemplateDetail,
  type CreateTemplateRequest,
  type UpdateTemplateRequest,
  type CreateBindingRequest,
  type BindingTemplateOption,
  type BindingHistoryItem,
  type EmployeeBindingHistoryResponse,
  type TeamStructureItem,
  type TeamStructureListResponse,
  type PublishEmployeeItem,
  type PublishRequest,
  type PublishResponse,
  type AssessmentInstanceItem,
  type AssessmentInstanceListParams,
  type AssessmentInstanceListResponse,
  type AssessmentIndicatorDetail,
  type AssessmentInstanceDetail,
  type RatingSubmitRequest,
  type SupervisorRatingResponse,
  type SignRequest,
  type RatingSubmitWithSignRequest,
  type DashboardTodosResponse,
  type DashboardOverviewResponse,
  type StatisticsRecordItem,
  type StatisticsRecordsResponse,
  type ChartsResponse,
  type SuccessResponse,
  type AdjustIndicatorInput,
  type AdjustRequest,
  type UnlockRequest,
  type BatchUnlockRequest,
  type BatchReturnRequest,
  type PublishExportRequest,
  type BatchOperationResponse,
  type ReminderPreviewResponse,
  type UnfinishedReminderRequest,
  type UnfinishedReminderResponse,
  type UnlockHistoryItem,
  type PeriodStatisticsResponse,
  type InstanceIndicatorItem,
  type InstanceIndicatorsResponse,
  type EmployeeSnapshotResponse,
  type MyAssessmentRecordItem,
  type MyAssessmentRecordsResponse,
  type MyAssessmentTrendResponse,
  type MyAssessmentSummary,
  type RemindRequest,
  type RemindResult,
  type RemindResponse,
  type TeamOverviewResponse,
  type SubordinateRecord,
  type SubordinatesResponse,
  type ExportResultItem,
  type ExportResult,
  type TeamEmployeeDetail,
  type TeamUpdateEmployeeRequest,
  type CreateResponse,
  type SignTokenRequest,
  type SignTokenResponse,
  type SignSessionResponse,
  type SignByTokenRequest,
  type SignStatusResponse,
  type SignSessionStatus,
  type SignSubmissionResponse,
} from './types/assessment.types';

export {
  type PermissionAction,
  type PermissionResource,
  type PermissionItem,
  DEFAULT_PERMISSIONS,
  type ForceRoleDTO,
  type RoleMemberDTO,
  type MemberMutationData,
  type MemberType,
  type UserSimpleDTO,
  type DepartmentDTO,
  type ChatSimpleDTO,
  type PresetGroupDTO,
  type SearchResponse,
  type SearchResult,
  type FilterParams,
  type I18nText,
  type ListMembersResponse,
  type CreateRoleResponse,
  type CreateRoleRequest,
  type UpdateRoleRequest,
  type AddMembersRequest,
  type RemoveMembersRequest,
  type SearchMembersRequest,
  type RolePermissionConfig,
  type UpdateRolePermissionsRequest,
  type RoleMemberMutationOutcomeStatus,
  type RoleMemberMutationOutcome,
  type RoleMemberMutationResponse,
  type RoleMemberMutationErrorDetails,
  BUILTIN_ROLE_CODES,
  PERMISSION_MATRIX,
  ROLE_OPTIONS,
  ROLE_LABELS,
} from './types/permission.types';

export {
  type ApiErrorDetails,
  type ApiErrorResponseData,
} from './types/error.types';

// === Employee Management ===

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
    activeBindings?: number;
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

export interface BatchDeactivateRequest {
  employeeIds: string[];
}

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
