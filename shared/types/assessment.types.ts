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

export interface BindingTemplateOption {
  id: string;
  name: string;
  position: string;
  type: 'monthly' | 'probation';
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

export interface PublishResponse {
  success: boolean;
  publishedCount: number;
}

export interface AssessmentInstanceItem {
  id: string;
  period: string;
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
  signName?: string;
  signImage: string;
}

export interface RatingSubmitWithSignRequest extends RatingSubmitRequest {
  signName?: string;
  signImage: string;
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
  shortcuts: Array<{ title: string; path: string }>;
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

export interface PublishExportRequest {
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
  period?: string;
  periods?: string[];
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

export interface RemindRequest {
  instanceIds: string[];
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

export interface ExportResultItem extends StatisticsRecordItem {}

export interface ExportResult {
  items: ExportResultItem[];
  total: number;
  exportedCount: number;
  isTruncated: boolean;
}

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

export interface CreateResponse {
  id: string;
}

export interface SignTokenRequest {
  signType: 'self' | 'supervisor';
  appBaseUrl: string;
}

export type SignSessionStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'invalid'
  | 'forbidden';

export interface SignTokenResponse {
  token: string;
  signUrl: string;
  instanceId: string;
  signType: 'self' | 'supervisor';
  employeeName: string;
  period: string;
}

export interface SignSessionResponse {
  status: SignSessionStatus;
  instanceId: string;
  signType: 'self' | 'supervisor';
  employeeName: string;
  period: string;
}

export interface SignByTokenRequest {
  token: string;
  signName?: string;
  signImage: string;
}

export interface SignStatusResponse {
  signed: boolean;
  status: SignSessionStatus;
}

export interface SignSubmissionResponse {
  success: boolean;
  status: SignSessionStatus;
}
