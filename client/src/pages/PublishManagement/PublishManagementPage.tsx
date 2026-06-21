import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@/utils/api-error';
import { Label } from '@/components/ui/label';
import MonthPicker from './MonthPicker';
import dayjs from 'dayjs';
import {
  listEmployees,
  publish,
  listInstances,
  adjust,
  batchUnlock,
  batchResendNotification,
  getPeriodStatistics,
} from '@/api/assessment-publish';
import type {
  PublishEmployeeItem,
  AssessmentInstanceItem,
  AdjustIndicatorInput,
  PeriodStatisticsResponse,
  BatchOperationResponse,
} from '@shared/api.interface';
import { PUBLISHED_STATUS_LABELS } from './published-assessment-columns';
import StatisticsCards from './StatisticsCards';
import PendingPublishSection from './PendingPublishSection';
import PublishedAssessmentSection from './PublishedAssessmentSection';
import AdjustIndicatorsDialog from './AdjustIndicatorsDialog';
import BatchUnlockDialog from './BatchUnlockDialog';
import UnlockHistoryDialog from './UnlockHistoryDialog';

const PAGE_SIZE: number = 20;

const PublishManagementPage: React.FC = () => {
  const [period, setPeriod] = useState<string>(dayjs().format('YYYY-MM'));

  const [statistics, setStatistics] = useState<PeriodStatisticsResponse | null>(
    null,
  );
  const [loadingStatistics, setLoadingStatistics] = useState<boolean>(false);

  const [employees, setEmployees] = useState<PublishEmployeeItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState<boolean>(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(
    new Set(),
  );
  const [publishing, setPublishing] = useState<boolean>(false);
  const [pendingDeptFilter, setPendingDeptFilter] = useState<string>('');
  const [pendingTplFilter, setPendingTplFilter] = useState<string>('');

  const [instances, setInstances] = useState<AssessmentInstanceItem[]>([]);
  const [instancesTotal, setInstancesTotal] = useState<number>(0);
  const [instancesPage, setInstancesPage] = useState<number>(1);
  const [loadingInstances, setLoadingInstances] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('__all__');
  const [deptFilter, setDeptFilter] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(
    new Set(),
  );
  const [batchNotifyLoading, setBatchNotifyLoading] = useState<boolean>(false);

  const [adjustOpen, setAdjustOpen] = useState<boolean>(false);
  const [adjustingInstance, setAdjustingInstance] =
    useState<AssessmentInstanceItem | null>(null);
  const [adjustLoading, setAdjustLoading] = useState<boolean>(false);

  const [unlockOpen, setUnlockOpen] = useState<boolean>(false);
  const [unlockTargetIds, setUnlockTargetIds] = useState<string[]>([]);
  const [unlockReason, setUnlockReason] = useState<string>('');
  const [unlockLoading, setUnlockLoading] = useState<boolean>(false);

  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [historyInstanceId, setHistoryInstanceId] = useState<string | null>(null);

  const fetchStatistics = useCallback(async (p: string): Promise<void> => {
    if (!p) return;
    setLoadingStatistics(true);
    try {
      const res = await getPeriodStatistics(p);
      setStatistics(res);
    } catch (err: unknown) {
      logger.error('fetchStatistics failed', err);
      handleApiError(err);
    } finally {
      setLoadingStatistics(false);
    }
  }, []);

  const fetchEmployees = useCallback(
    async (p: string, dept: string, tpl: string): Promise<void> => {
      if (!p) return;
      setLoadingEmployees(true);
      try {
        const res = await listEmployees(p, {
          department: dept || undefined,
          templateId: tpl || undefined,
        });
        setEmployees(res.items);
        setSelectedEmployeeIds(new Set());
      } catch (err: unknown) {
        logger.error('fetchEmployees failed', err);
        handleApiError(err);
      } finally {
        setLoadingEmployees(false);
      }
    },
    [],
  );

  const fetchInstances = useCallback(async (): Promise<void> => {
    if (!period) return;
    setLoadingInstances(true);
    try {
      const status = statusFilter === '__all__' ? undefined : statusFilter;
      const res = await listInstances({
        period,
        page: instancesPage,
        pageSize: PAGE_SIZE,
        status,
        department: deptFilter || undefined,
        grade: gradeFilter || undefined,
      });
      setInstances(res.items);
      setInstancesTotal(res.total);
    } catch (err: unknown) {
      logger.error('fetchInstances failed', err);
      handleApiError(err);
    } finally {
      setLoadingInstances(false);
    }
  }, [period, instancesPage, statusFilter, deptFilter, gradeFilter]);

  useEffect(() => {
    if (!period) return;
    fetchStatistics(period);
    fetchEmployees(period, pendingDeptFilter, pendingTplFilter);
  }, [period, pendingDeptFilter, pendingTplFilter, fetchStatistics, fetchEmployees]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

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
    return Array.from(map.entries()).map(
      ([id, name]: [string, string]) => ({ id, name }),
    );
  }, [employees]);

  const handlePeriodChange = (value: string): void => {
    setPeriod(value);
    setInstancesPage(1);
    setSelectedInstanceIds(new Set());
  };

  const handleSelectAllEmployees = (checked: boolean): void => {
    if (checked) {
      setSelectedEmployeeIds(
        new Set(
          employees.map((e: PublishEmployeeItem) => e.employeeId),
        ),
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
        period,
        employeeIds: Array.from(selectedEmployeeIds),
      });
      toast.success(`发布成功，共 ${result.publishedCount} 人`);
      setSelectedEmployeeIds(new Set());
      fetchEmployees(period, pendingDeptFilter, pendingTplFilter);
      fetchInstances();
      fetchStatistics(period);
    } catch (err: unknown) {
      logger.error('publish failed', err);
      handleApiError(err);
    } finally {
      setPublishing(false);
    }
  };

  const handleOpenAdjust = (inst: AssessmentInstanceItem): void => {
    setAdjustingInstance(inst);
    setAdjustOpen(true);
  };

  const handleAdjustSubmit = async (
    indicators: AdjustIndicatorInput[],
  ): Promise<void> => {
    if (!adjustingInstance) return;
    setAdjustLoading(true);
    try {
      await adjust(adjustingInstance.id, { indicators });
      toast.success('调整成功');
      setAdjustOpen(false);
      fetchInstances();
    } catch (err: unknown) {
      logger.error('adjust failed', err);
      handleApiError(err);
    } finally {
      setAdjustLoading(false);
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

  const UNLOCKABLE_STATUSES: string[] = ['completed', 'pending_sign', 'supervisor_review'];

  const handleOpenBatchUnlock = (): void => {
    if (selectedInstanceIds.size === 0) {
      toast.error('请选择要解锁的考核');
      return;
    }
    const selectedInstances: AssessmentInstanceItem[] = instances.filter(
      (inst: AssessmentInstanceItem) => selectedInstanceIds.has(inst.id),
    );
    const unlockable: AssessmentInstanceItem[] = selectedInstances.filter(
      (inst: AssessmentInstanceItem) => UNLOCKABLE_STATUSES.includes(inst.status),
    );
    const notUnlockableCount: number = selectedInstances.length - unlockable.length;
    if (unlockable.length === 0) {
      toast.error('选中的考核均不可解锁（仅支持上级评分中/待签名/已完成状态）');
      return;
    }
    if (notUnlockableCount > 0) {
      toast.info(`已自动过滤 ${notUnlockableCount} 项不可解锁的考核`);
    }
    setUnlockTargetIds(unlockable.map((inst: AssessmentInstanceItem) => inst.id));
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
        toast.warning(`解锁完成：成功 ${result.successCount} 项，失败 ${result.failedCount} 项`);
      } else {
        toast.error(`解锁失败，共 ${result.failedCount} 项（状态不允许解锁）`);
      }
      setUnlockOpen(false);
      setSelectedInstanceIds(new Set());
      fetchInstances();
      fetchStatistics(period);
    } catch (err: unknown) {
      logger.error('unlock failed', err);
      handleApiError(err);
    } finally {
      setUnlockLoading(false);
    }
  };

  const handleBatchNotify = async (): Promise<void> => {
    if (selectedInstanceIds.size === 0) {
      toast.error('请选择要通知的考核');
      return;
    }
    setBatchNotifyLoading(true);
    try {
      const result = await batchResendNotification({
        instanceIds: Array.from(selectedInstanceIds),
      });
      if (result.failedCount > 0) {
        toast.success(
          `发送完成：成功 ${result.successCount} 项，失败 ${result.failedCount} 项`,
        );
      } else {
        toast.success(`通知发送成功，共 ${result.successCount} 项`);
      }
    } catch (err: unknown) {
      logger.error('batchNotify failed', err);
      handleApiError(err);
    } finally {
      setBatchNotifyLoading(false);
    }
  };

  const handleExport = (): void => {
    if (instances.length === 0) {
      toast.error('暂无数据可导出');
      return;
    }
    import('xlsx')
      .then((XLSX: typeof import('xlsx')) => {
        const data = instances.map((inst: AssessmentInstanceItem) => ({
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
        XLSX.utils.book_append_sheet(wb, ws, '考核列表');
        XLSX.writeFile(wb, `考核列表_${period}.xlsx`);
        toast.success('导出成功');
      })
      .catch((err: unknown) => {
        logger.error('export failed', err);
        handleApiError(err);
      });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">考核发布管理</h1>
      </div>

      <div className="flex items-center gap-3">
        <Label className="shrink-0 text-sm font-medium">考核周期</Label>
        <MonthPicker value={period} onChange={handlePeriodChange} />
      </div>

      <>
        <StatisticsCards
            statistics={statistics}
            loading={loadingStatistics}
          />

          <PendingPublishSection
            employees={employees}
            loading={loadingEmployees}
            selectedIds={selectedEmployeeIds}
            onSelectAll={handleSelectAllEmployees}
            onSelectOne={handleSelectOneEmployee}
            onPublish={handlePublish}
            publishing={publishing}
            departmentFilter={pendingDeptFilter}
            onDepartmentFilterChange={setPendingDeptFilter}
            templateFilter={pendingTplFilter}
            onTemplateFilterChange={setPendingTplFilter}
            departments={departments}
            templates={templates}
          />

          <PublishedAssessmentSection
            instances={instances}
            loading={loadingInstances}
            total={instancesTotal}
            page={instancesPage}
            pageSize={PAGE_SIZE}
            onPageChange={setInstancesPage}
            statusFilter={statusFilter}
            onStatusFilterChange={(v: string) => {
              setStatusFilter(v);
              setInstancesPage(1);
            }}
            departmentFilter={deptFilter}
            onDepartmentFilterChange={(v: string) => {
              setDeptFilter(v);
              setInstancesPage(1);
            }}
            gradeFilter={gradeFilter}
            onGradeFilterChange={(v: string) => {
              setGradeFilter(v);
              setInstancesPage(1);
            }}
            selectedInstanceIds={selectedInstanceIds}
            onSelectedInstancesChange={setSelectedInstanceIds}
            onAdjust={handleOpenAdjust}
            onUnlock={handleOpenSingleUnlock}
            onHistory={handleOpenHistory}
            onBatchUnlock={handleOpenBatchUnlock}
            onBatchNotify={handleBatchNotify}
            onExport={handleExport}
            batchUnlockLoading={unlockLoading}
            batchNotifyLoading={batchNotifyLoading}
            departments={departments}
          />

          <AdjustIndicatorsDialog
            open={adjustOpen}
            onOpenChange={setAdjustOpen}
            instance={adjustingInstance}
            onSubmit={handleAdjustSubmit}
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
        </>
    </div>
  );
};

export default PublishManagementPage;
