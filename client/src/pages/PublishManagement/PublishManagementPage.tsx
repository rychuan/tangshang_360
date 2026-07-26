import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@/utils/api-error';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MultiMonthPicker from '@/components/ui/multi-month-picker';
import dayjs from 'dayjs';
import {
  listEmployees,
  publish,
  listInstances,
  exportInstances,
  adjustEmployeeSnapshot,
  deleteEmployeeSnapshot,
  batchUnlock,
  batchReturn,
  getPeriodStatistics,
  previewUnfinishedReminders,
  remindUnfinishedAssessments,
} from '@/api/assessment-publish';
import type {
  PublishEmployeeItem,
  AssessmentInstanceItem,
  AdjustIndicatorInput,
  PeriodStatisticsResponse,
  BatchOperationResponse,
  ReminderPreviewResponse,
} from '@shared/api.interface';
import { PageHeader } from '@/components/business-ui/page-header';
import { PUBLISHED_STATUS_LABELS } from './published-assessment-columns';
import StatisticsCards from './StatisticsCards';
import PendingPublishSection from './PendingPublishSection';
import PublishedAssessmentSection from './PublishedAssessmentSection';
import AdjustIndicatorsDialog from './AdjustIndicatorsDialog';
import BatchUnlockDialog from './BatchUnlockDialog';
import UnlockHistoryDialog from './UnlockHistoryDialog';
import UnfinishedReminderDialog from './UnfinishedReminderDialog';
import { getAppBaseUrl } from '@/utils/app-url';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PublishManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [periods, setPeriods] = useState<string[]>([currentMonth()]);

  const [pendingDeptFilter, setPendingDeptFilter] = useState<string>('');
  const [pendingTplFilter, setPendingTplFilter] = useState<string>('');
  const [instancesPage, setInstancesPage] = useState<number>(1);
  const [statusFilter, setStatusFilter] = useState<string>('__all__');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'pending' | 'published'>(
    'pending',
  );
  const effectivePeriod = periods[0] ?? currentMonth();
  const [pendingPage, setPendingPage] = useState<number>(1);
  const [pendingPageSize, setPendingPageSize] = useState<number>(20);
  const [publishedPageSize, setPublishedPageSize] = useState<number>(20);

  const statisticsQuery = useQuery({
    queryKey: ['publish', 'statistics', effectivePeriod],
    queryFn: () => getPeriodStatistics(effectivePeriod),
    enabled: !!effectivePeriod,
  });
  const statistics = statisticsQuery.data ?? null;
  const loadingStatistics = statisticsQuery.isLoading;

  const employeesQuery = useQuery({
    queryKey: [
      'publish',
      'employees',
      effectivePeriod,
      pendingDeptFilter,
      pendingTplFilter,
    ],
    queryFn: () =>
      listEmployees(effectivePeriod, {
        department: pendingDeptFilter || undefined,
        templateId: pendingTplFilter || undefined,
      }),
    enabled: !!effectivePeriod,
  });
  const employees: PublishEmployeeItem[] = employeesQuery.data?.items ?? [];
  const loadingEmployees = employeesQuery.isLoading;

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set(),
  );
  const [publishing, setPublishing] = useState<boolean>(false);

  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(
    new Set(),
  );
  const [batchReturnLoading, setBatchReturnLoading] = useState<boolean>(false);
  const [reminderPreviewLoading, setReminderPreviewLoading] =
    useState<boolean>(false);
  const [reminderSending, setReminderSending] = useState<boolean>(false);
  const [reminderOpen, setReminderOpen] = useState<boolean>(false);
  const [reminderPreview, setReminderPreview] =
    useState<ReminderPreviewResponse | null>(null);

  const [adjustOpen, setAdjustOpen] = useState<boolean>(false);
  const [adjustingEmployee, setAdjustingEmployee] =
    useState<PublishEmployeeItem | null>(null);
  const [adjustLoading, setAdjustLoading] = useState<boolean>(false);

  const [unlockOpen, setUnlockOpen] = useState<boolean>(false);
  const [unlockTargetIds, setUnlockTargetIds] = useState<string[]>([]);
  const [unlockReason, setUnlockReason] = useState<string>('');
  const [unlockLoading, setUnlockLoading] = useState<boolean>(false);

  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [historyInstanceId, setHistoryInstanceId] = useState<string | null>(
    null,
  );

  const instancesQuery = useQuery({
    queryKey: [
      'publish',
      'instances',
      { periods, page: instancesPage, statusFilter, deptFilter, gradeFilter },
    ],
    queryFn: () =>
      listInstances({
        periods: periods.length > 0 ? periods : undefined,
        page: instancesPage,
        pageSize: publishedPageSize,
        status: statusFilter === '__all__' ? undefined : statusFilter,
        department: deptFilter || undefined,
        grade: gradeFilter || undefined,
      }),
    enabled: periods.length > 0,
  });
  const instances: AssessmentInstanceItem[] = instancesQuery.data?.items ?? [];
  const instancesTotal: number = instancesQuery.data?.total ?? 0;
  const loadingInstances = instancesQuery.isLoading;

  const departments: string[] = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e: PublishEmployeeItem) => {
      if (e.department) set.add(e.department);
    });
    instances.forEach((i: AssessmentInstanceItem) => {
      if (i.department) set.add(i.department);
    });
    return Array.from(set).sort();
  }, [employees, instances]);

  const templates: Array<{ id: string; name: string }> = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e: PublishEmployeeItem) => {
      if (e.templateId) map.set(e.templateId, e.templateName);
    });
    return Array.from(map.entries()).map(([id, name]: [string, string]) => ({
      id,
      name,
    }));
  }, [employees]);

  const handlePeriodChange = (value: string[]): void => {
    setPeriods(value);
    setInstancesPage(1);
    setSelectedInstanceIds(new Set());
  };

  const handleSelectAllEmployees = (checked: boolean): void => {
    if (checked) {
      setSelectedEmployeeIds(
        new Set(employees.map((e: PublishEmployeeItem) => e.employeeId)),
      );
    } else {
      setSelectedEmployeeIds(new Set());
    }
  };

  const handleSelectOneEmployee = (
    employeeId: string,
    checked: boolean,
  ): void => {
    const next: Set<string> = new Set(selectedEmployeeIds);
    if (checked) {
      next.add(employeeId);
    } else {
      next.delete(employeeId);
    }
    setSelectedEmployeeIds(next);
  };

  const handlePublish = async (): Promise<void> => {
    if (selectedEmployeeIds.size === 0) {
      toast.error('请选择要发布的员工');
      return;
    }
    setPublishing(true);
    try {
      const result = await publish({
        period: effectivePeriod,
        employeeIds: Array.from(selectedEmployeeIds),
        appBaseUrl: getAppBaseUrl(),
      });
      toast.success(`发布成功，共 ${result.publishedCount} 人`);
      setSelectedEmployeeIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['publish'] });
      queryClient.invalidateQueries({ queryKey: ['publish', 'instances'] });
      queryClient.invalidateQueries({
        queryKey: ['publish', 'statistics', effectivePeriod],
      });
    } catch (err: unknown) {
      logger.error('publish failed', err);
      handleApiError(err);
    } finally {
      setPublishing(false);
    }
  };

  const handleOpenAdjust = (emp: PublishEmployeeItem): void => {
    setAdjustingEmployee(emp);
    setAdjustOpen(true);
  };

  const handleAdjustSubmit = async (
    indicators: AdjustIndicatorInput[],
  ): Promise<void> => {
    if (!adjustingEmployee) {
      toast.error('调整失败：员工信息丢失');
      return;
    }
    setAdjustLoading(true);
    try {
      await adjustEmployeeSnapshot(adjustingEmployee.employeeId, {
        indicators,
      });
      toast.success('调整成功');
      setAdjustOpen(false);
      queryClient.invalidateQueries({ queryKey: ['publish'] });
    } catch (err: unknown) {
      logger.error('adjust failed', err);
      handleApiError(err);
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleDeleteSnapshot = async (
    emp: PublishEmployeeItem,
  ): Promise<void> => {
    try {
      await deleteEmployeeSnapshot(emp.employeeId);
      toast.success('快照已删除');
      queryClient.invalidateQueries({ queryKey: ['publish'] });
    } catch (err: unknown) {
      logger.error('deleteSnapshot failed', err);
      handleApiError(err);
    }
  };

  const handleOpenSingleUnlock = (inst: AssessmentInstanceItem): void => {
    setUnlockTargetIds([inst.id]);
    setUnlockReason('');
    setUnlockOpen(true);
  };

  const handleOpenHistory = (inst: AssessmentInstanceItem): void => {
    setHistoryInstanceId(inst.id);
    setHistoryOpen(true);
  };

  const UNLOCKABLE_STATUSES: string[] = [
    'completed',
    'supervisor_sign',
    'pending_sign',
    'supervisor_review',
    'self_review',
  ];

  const handleOpenBatchUnlock = (): void => {
    if (selectedInstanceIds.size === 0) {
      toast.error('请选择要解锁的绩效');
      return;
    }
    const selectedInstances: AssessmentInstanceItem[] = instances.filter(
      (inst: AssessmentInstanceItem) => selectedInstanceIds.has(inst.id),
    );
    const unlockable: AssessmentInstanceItem[] = selectedInstances.filter(
      (inst: AssessmentInstanceItem) =>
        UNLOCKABLE_STATUSES.includes(inst.status),
    );
    const notUnlockableCount: number =
      selectedInstances.length - unlockable.length;
    if (unlockable.length === 0) {
      toast.error(
        '选中的绩效均不可解锁（仅支持员工步骤中/上级步骤中/已完成状态）',
      );
      return;
    }
    if (notUnlockableCount > 0) {
      toast.info(`已自动过滤 ${notUnlockableCount} 项不可解锁的绩效`);
    }
    setUnlockTargetIds(
      unlockable.map((inst: AssessmentInstanceItem) => inst.id),
    );
    setUnlockReason('');
    setUnlockOpen(true);
  };

  const handleUnlockSubmit = async (): Promise<void> => {
    if (!unlockReason.trim()) {
      toast.error('请输入解锁原因');
      return;
    }
    setUnlockLoading(true);
    try {
      const result: BatchOperationResponse = await batchUnlock({
        instanceIds: unlockTargetIds,
        reason: unlockReason.trim(),
      });
      if (result.failedCount === 0) {
        toast.success(`解锁成功，共 ${result.successCount} 项`);
      } else if (result.successCount > 0) {
        toast.warning(
          `解锁完成：成功 ${result.successCount} 项，失败 ${result.failedCount} 项`,
        );
      } else {
        toast.error(`解锁失败，共 ${result.failedCount} 项（状态不允许解锁）`);
      }
      setUnlockOpen(false);
      setSelectedInstanceIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['publish', 'instances'] });
      queryClient.invalidateQueries({
        queryKey: ['publish', 'statistics', effectivePeriod],
      });
    } catch (err: unknown) {
      logger.error('unlock failed', err);
      handleApiError(err);
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleOpenUnfinishedReminder = async (): Promise<void> => {
    setReminderPreviewLoading(true);
    try {
      const preview = await previewUnfinishedReminders({
        periods: periods.length > 0 ? periods : undefined,
        department: deptFilter || undefined,
        status: statusFilter === '__all__' ? undefined : statusFilter,
        grade: gradeFilter || undefined,
      });
      if (preview.taskCount === 0) {
        toast.info('当前范围内没有未完成的绩效任务');
        return;
      }
      setReminderPreview(preview);
      setReminderOpen(true);
    } catch (err: unknown) {
      logger.error('previewUnfinishedReminders failed', err);
      handleApiError(err);
    } finally {
      setReminderPreviewLoading(false);
    }
  };

  const handleConfirmUnfinishedReminder = async (): Promise<void> => {
    setReminderSending(true);
    try {
      const result = await remindUnfinishedAssessments({
        periods: periods.length > 0 ? periods : undefined,
        department: deptFilter || undefined,
        status: statusFilter === '__all__' ? undefined : statusFilter,
        grade: gradeFilter || undefined,
        appBaseUrl: getAppBaseUrl(),
      });
      if (result.failedCount === 0 && result.missingSupervisorCount === 0) {
        toast.success(`通知发送成功，共 ${result.sentCount} 条消息`);
      } else if (
        result.failedCount === 0 &&
        result.missingSupervisorCount > 0
      ) {
        toast.warning(
          `通知已发送 ${result.sentCount} 条，另有 ${result.missingSupervisorCount} 项未配置上级`,
        );
      } else if (result.sentCount > 0) {
        toast.warning(
          `通知发送完成：成功 ${result.sentCount} 条，失败 ${result.failedCount} 条`,
        );
      } else {
        toast.error(`通知发送失败，共 ${result.failedCount} 条`);
      }
      setReminderOpen(false);
      setReminderPreview(null);
      setSelectedInstanceIds(new Set());
    } catch (err: unknown) {
      logger.error('remindUnfinishedAssessments failed', err);
      handleApiError(err);
    } finally {
      setReminderSending(false);
    }
  };

  const handleReturn = async (inst: AssessmentInstanceItem): Promise<void> => {
    setBatchReturnLoading(true);
    try {
      const result: BatchOperationResponse = await batchReturn({
        instanceIds: [inst.id],
      });
      if (result.failedCount === 0) {
        toast.success('退回成功');
      } else {
        toast.error('退回失败');
      }
      setSelectedInstanceIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['publish', 'instances'] });
      queryClient.invalidateQueries({
        queryKey: ['publish', 'statistics', effectivePeriod],
      });
      queryClient.invalidateQueries({ queryKey: ['publish'] });
    } catch (err: unknown) {
      logger.error('return failed', err);
      handleApiError(err);
    } finally {
      setBatchReturnLoading(false);
    }
  };

  const handleBatchReturn = async (): Promise<void> => {
    if (selectedInstanceIds.size === 0) {
      toast.error('请选择要退回的绩效');
      return;
    }
    const selectedInstances: AssessmentInstanceItem[] = instances.filter(
      (inst: AssessmentInstanceItem) => selectedInstanceIds.has(inst.id),
    );
    const returnable: AssessmentInstanceItem[] = selectedInstances.filter(
      (inst: AssessmentInstanceItem) => inst.status === 'self_review',
    );
    const notReturnableCount: number =
      selectedInstances.length - returnable.length;
    if (returnable.length === 0) {
      toast.error('选中的绩效均不可退回（仅支持自评中状态）');
      return;
    }
    if (notReturnableCount > 0) {
      toast.info(`已自动过滤 ${notReturnableCount} 项不可退回的绩效`);
    }
    setBatchReturnLoading(true);
    try {
      const result: BatchOperationResponse = await batchReturn({
        instanceIds: returnable.map((inst: AssessmentInstanceItem) => inst.id),
      });
      if (result.failedCount === 0) {
        toast.success(`退回成功，共 ${result.successCount} 项`);
      } else if (result.successCount > 0) {
        toast.warning(
          `退回完成：成功 ${result.successCount} 项，失败 ${result.failedCount} 项`,
        );
      } else {
        toast.error(`退回失败，共 ${result.failedCount} 项`);
      }
      setSelectedInstanceIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['publish', 'instances'] });
      queryClient.invalidateQueries({
        queryKey: ['publish', 'statistics', effectivePeriod],
      });
      queryClient.invalidateQueries({ queryKey: ['publish'] });
    } catch (err: unknown) {
      logger.error('batchReturn failed', err);
      handleApiError(err);
    } finally {
      setBatchReturnLoading(false);
    }
  };

  const handleExport = async (): Promise<void> => {
    if (selectedInstanceIds.size === 0) {
      toast.error('请选择要导出的绩效');
      return;
    }
    try {
      const [XLSX, exportedInstances] = await Promise.all([
        import('xlsx'),
        exportInstances([...selectedInstanceIds]),
      ]);
      const data = exportedInstances.map((inst: AssessmentInstanceItem) => ({
        周期: inst.period,
        员工: inst.employeeName,
        部门: inst.department,
        岗位: inst.position,
        上级: inst.supervisorName,
        状态: PUBLISHED_STATUS_LABELS[inst.status] || inst.status,
        自评完成: inst.selfReviewCompleted ? '是' : '否',
        上级评分完成: inst.supervisorReviewCompleted ? '是' : '否',
        总分: inst.totalScore ?? '',
        等级: inst.grade ?? '',
        发布时间: inst.publishedAt
          ? dayjs(inst.publishedAt).format('YYYY-MM-DD HH:mm')
          : '',
        发布人: inst.publishedByName,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '绩效列表');
      XLSX.writeFile(wb, `绩效列表_${effectivePeriod}.xlsx`);
      toast.success(`导出成功，共 ${exportedInstances.length} 条`);
    } catch (err: unknown) {
      logger.error('export failed', err);
      handleApiError(err);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 gap-4 md:gap-6">
      <div className="flex items-center gap-4">
        <PageHeader title="绩效发布管理" visuallyHidden />
      </div>

      <StatisticsCards statistics={statistics} loading={loadingStatistics} />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'pending' | 'published')}
        className="flex flex-1 flex-col min-h-0"
      >
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="pending" className="text-xs sm:text-sm">
              待发布绩效
            </TabsTrigger>
            <TabsTrigger value="published" className="text-xs sm:text-sm">
              已发布绩效
            </TabsTrigger>
          </TabsList>
          <MultiMonthPicker value={periods} onChange={handlePeriodChange} />
        </div>

        <TabsContent value="pending" className="flex-1 flex-col min-h-0 mt-4">
          <PendingPublishSection
            employees={employees}
            loading={loadingEmployees}
            selectedIds={selectedEmployeeIds}
            onSelectAll={handleSelectAllEmployees}
            onSelectOne={handleSelectOneEmployee}
            onPublish={handlePublish}
            publishing={publishing}
            departmentFilter={pendingDeptFilter}
            onDepartmentFilterChange={(v) => {
              setPendingDeptFilter(v);
              setPendingPage(1);
            }}
            templateFilter={pendingTplFilter}
            onTemplateFilterChange={(v) => {
              setPendingTplFilter(v);
              setPendingPage(1);
            }}
            departments={departments}
            templates={templates}
            period={effectivePeriod}
            onAdjust={handleOpenAdjust}
            onDeleteSnapshot={handleDeleteSnapshot}
            page={pendingPage}
            pageSize={pendingPageSize}
            total={employees.length}
            onPageChange={setPendingPage}
            onPageSizeChange={setPendingPageSize}
          />
        </TabsContent>

        <TabsContent value="published" className="flex-1 flex-col min-h-0 mt-4">
          <PublishedAssessmentSection
            instances={instances}
            loading={loadingInstances}
            total={instancesTotal}
            page={instancesPage}
            pageSize={publishedPageSize}
            onPageChange={(nextPage: number) => {
              setInstancesPage(nextPage);
              setSelectedInstanceIds(new Set());
            }}
            onPageSizeChange={setPublishedPageSize}
            statusFilter={statusFilter}
            onStatusFilterChange={(v: string) => {
              setStatusFilter(v);
              setInstancesPage(1);
              setSelectedInstanceIds(new Set());
            }}
            departmentFilter={deptFilter}
            onDepartmentFilterChange={(v: string) => {
              setDeptFilter(v);
              setInstancesPage(1);
              setSelectedInstanceIds(new Set());
            }}
            gradeFilter={gradeFilter}
            onGradeFilterChange={(v: string) => {
              setGradeFilter(v);
              setInstancesPage(1);
              setSelectedInstanceIds(new Set());
            }}
            selectedInstanceIds={selectedInstanceIds}
            onSelectedInstancesChange={setSelectedInstanceIds}
            onUnlock={handleOpenSingleUnlock}
            onHistory={handleOpenHistory}
            onReturn={handleReturn}
            onBatchUnlock={handleOpenBatchUnlock}
            onBatchReturn={handleBatchReturn}
            onRemindUnfinished={handleOpenUnfinishedReminder}
            onExport={handleExport}
            batchUnlockLoading={unlockLoading}
            batchReturnLoading={batchReturnLoading}
            reminderLoading={reminderPreviewLoading || reminderSending}
            departments={departments}
          />
        </TabsContent>
      </Tabs>

      <AdjustIndicatorsDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        employee={
          adjustingEmployee
            ? {
                employeeId: adjustingEmployee.employeeId,
                employeeName: adjustingEmployee.employeeName,
                templateName: adjustingEmployee.templateName,
              }
            : null
        }
        onSubmit={handleAdjustSubmit}
        onDeleteSnapshot={() => {
          if (adjustingEmployee) {
            handleDeleteSnapshot(adjustingEmployee);
            setAdjustOpen(false);
          }
        }}
        loading={adjustLoading}
      />

      <BatchUnlockDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        selectedCount={unlockTargetIds.length}
        reason={unlockReason}
        onReasonChange={setUnlockReason}
        onSubmit={handleUnlockSubmit}
        loading={unlockLoading}
      />

      <UnlockHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        instanceId={historyInstanceId}
      />

      <UnfinishedReminderDialog
        open={reminderOpen}
        onOpenChange={(open: boolean) => {
          if (!reminderSending) setReminderOpen(open);
        }}
        preview={reminderPreview}
        period={effectivePeriod}
        department={deptFilter || undefined}
        statusLabel={
          statusFilter === 'employee_processing'
            ? '员工处理中'
            : statusFilter === 'supervisor_processing'
              ? '上级处理中'
              : statusFilter === 'completed'
                ? '已完成'
                : '全部未完成状态'
        }
        grade={gradeFilter || undefined}
        sending={reminderSending}
        onConfirm={handleConfirmUnfinishedReminder}
      />
    </div>
  );
};

export default PublishManagementPage;
