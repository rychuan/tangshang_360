import React from 'react';
import { useTableScrollHeight } from '@/hooks/useTableScrollHeight';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from '@/components/ui/select';
import { CanDo, usePermission } from '@/hooks/usePermissions';
import { UserDisplay } from '@/components/business-ui/user-display';
import {
  Unlock,
  BellRing,
  Download,
  Award,
  Undo2,
} from '@/components/ui/hugeicons';
import dayjs from 'dayjs';
import type { AssessmentInstanceItem } from '@shared/api.interface';
import { StatusBadge } from '@/components/business-ui/status-badge';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { PUBLISHED_STATUS_LABELS } from './published-assessment-columns';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';
import { EMPLOYEE_PAGE_SIZES } from '@shared/employee-pagination';

interface PublishedAssessmentSectionProps {
  instances: AssessmentInstanceItem[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  departmentFilter: string;
  onDepartmentFilterChange: (value: string) => void;
  gradeFilter: string;
  onGradeFilterChange: (value: string) => void;
  selectedInstanceIds: Set<string>;
  onSelectedInstancesChange: (ids: Set<string>) => void;
  onUnlock: (instance: AssessmentInstanceItem) => void;
  onHistory: (instance: AssessmentInstanceItem) => void;
  onReturn: (instance: AssessmentInstanceItem) => void;
  onBatchUnlock: () => void;
  onBatchReturn: () => void;
  onRemindUnfinished: () => void;
  onExport: () => void;
  batchUnlockLoading: boolean;
  batchReturnLoading: boolean;
  reminderLoading: boolean;
  departments: string[];
}

const PublishedAssessmentSection: React.FC<PublishedAssessmentSectionProps> = ({
  instances,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  statusFilter,
  onStatusFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  gradeFilter,
  onGradeFilterChange,
  selectedInstanceIds,
  onSelectedInstancesChange,
  onUnlock,
  onHistory,
  onReturn,
  onBatchUnlock,
  onBatchReturn,
  onRemindUnfinished,
  onExport,
  batchUnlockLoading,
  batchReturnLoading,
  reminderLoading,
  departments,
}) => {
  const totalPages = Math.ceil(total / pageSize);
  const visiblePages = React.useMemo(() => {
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [page, totalPages]);
  const canEdit = usePermission('publish_management', 'edit');
  const canExport = usePermission('publish_management', 'export');
  const canSelect = canEdit || canExport;
  const allSelected =
    instances.length > 0 && selectedInstanceIds.size === instances.length;

  const handleSelectAll = (checked: boolean): void => {
    if (checked) {
      onSelectedInstancesChange(
        new Set(instances.map((i: AssessmentInstanceItem) => i.id)),
      );
    } else {
      onSelectedInstancesChange(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean): void => {
    const next = new Set(selectedInstanceIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedInstancesChange(next);
  };

  const handleDeptChange = (v: string): void => {
    onDepartmentFilterChange(v === '__all__' ? '' : v);
  };

  const handleGradeChange = (v: string): void => {
    onGradeFilterChange(v === '__all__' ? '' : v);
  };
  const { tableRef, tableMaxHeight } = useTableScrollHeight();

  return (
    <div
      ref={tableRef}
      style={{ maxHeight: tableMaxHeight }}
      data-ai-section-type="card-list"
      className="flex flex-col rounded-lg border bg-card p-6"
    >
      <div className="shrink-0 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">已发布绩效</h2>
          <CanDo resource="publish_management" action="edit">
            <Button
              variant="outline"
              size="sm"
              onClick={onRemindUnfinished}
              disabled={reminderLoading}
            >
              <BellRing data-icon="inline-start" />
              {reminderLoading ? '加载中...' : '通知未完成任务'}
            </Button>
          </CanDo>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm text-muted-foreground">
              部门
            </Label>
            <Select
              value={departmentFilter || '__all__'}
              onValueChange={handleDeptChange}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__all__">全部</SelectItem>
                  {departments.map((dept: string) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm text-muted-foreground">
              状态
            </Label>
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__all__">全部</SelectItem>
                  <SelectItem value="employee_processing">
                    员工处理中
                  </SelectItem>
                  <SelectItem value="supervisor_processing">
                    上级处理中
                  </SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm text-muted-foreground">
              等级
            </Label>
            <Select
              value={gradeFilter || '__all__'}
              onValueChange={handleGradeChange}
            >
              <SelectTrigger className="w-24">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__all__">全部</SelectItem>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                  <SelectItem value="D">D</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {selectedInstanceIds.size > 0 && (
        <div className="shrink-0 mb-3 flex flex-wrap items-center gap-3 rounded-md bg-accent px-4 py-2">
          <span className="text-sm font-medium">
            已选择 {selectedInstanceIds.size} 项
          </span>
          <div className="flex items-center gap-2">
            <CanDo resource="publish_management" action="edit">
              <Button
                variant="outline"
                size="sm"
                onClick={onBatchReturn}
                disabled={batchReturnLoading}
              >
                <Undo2 data-icon="inline-start" />
                {batchReturnLoading ? '退回中...' : '批量退回'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onBatchUnlock}
                disabled={batchUnlockLoading}
              >
                <Unlock data-icon="inline-start" />
                {batchUnlockLoading ? '解锁中...' : '批量解锁'}
              </Button>
            </CanDo>
            <CanDo resource="publish_management" action="export">
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download data-icon="inline-start" />
                导出列表
              </Button>
            </CanDo>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Spinner />
        </div>
      ) : instances.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Award className="size-6" />
            </EmptyMedia>
            <EmptyTitle>暂无数据</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div
            className="flex-1 overflow-y-auto min-h-0"
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow className="border-b text-muted-foreground">
                  {canSelect && (
                    <TableHead className="w-10 py-3 pr-4 font-medium">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked: boolean) =>
                          handleSelectAll(checked)
                        }
                      />
                    </TableHead>
                  )}
                  <TableHead className="py-3 pr-4 font-medium text-left">
                    员工
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left">
                    周期
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left hidden md:table-cell">
                    部门
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left hidden lg:table-cell">
                    岗位
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left hidden lg:table-cell">
                    上级
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left">
                    状态
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left hidden sm:table-cell">
                    绩效进度
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-right">
                    总分
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left hidden sm:table-cell">
                    等级
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left hidden md:table-cell">
                    发布时间
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left hidden md:table-cell">
                    发布人
                  </TableHead>
                  <TableHead className="py-3 pr-4 font-medium text-left sticky right-0 bg-background z-20 border-l">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {instances.map((record: AssessmentInstanceItem) => (
                  <TableRow
                    key={record.id}
                    className="group border-b hover:bg-muted/50"
                  >
                    {canSelect && (
                      <TableCell className="py-3 pr-4">
                        <Checkbox
                          checked={selectedInstanceIds.has(record.id)}
                          onCheckedChange={(checked: boolean) =>
                            handleSelectOne(record.id, checked)
                          }
                        />
                      </TableCell>
                    )}
                    <TableCell className="py-3 pr-4">
                      <UserDisplay value={[record.employeeId]} size="small" />
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <Badge variant="outline" className="text-xs font-mono">
                        {record.period}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 pr-4 hidden md:table-cell">
                      {record.department}
                    </TableCell>
                    <TableCell className="py-3 pr-4 hidden lg:table-cell">
                      {record.position}
                    </TableCell>
                    <TableCell className="py-3 pr-4 hidden lg:table-cell">
                      {record.supervisorId ? (
                        <UserDisplay
                          value={[record.supervisorId]}
                          size="small"
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <StatusBadge status={record.status} />
                    </TableCell>
                    <TableCell className="py-3 pr-4 hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            record.selfReviewCompleted ? 'default' : 'outline'
                          }
                          className="text-xs"
                        >
                          自评{record.selfReviewCompleted ? '✓' : '×'}
                        </Badge>
                        <Badge
                          variant={
                            record.supervisorReviewCompleted
                              ? 'default'
                              : 'outline'
                          }
                          className="text-xs"
                        >
                          上级{record.supervisorReviewCompleted ? '✓' : '×'}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-right">
                      {record.totalScore != null ? record.totalScore : '-'}
                    </TableCell>
                    <TableCell className="py-3 pr-4 hidden sm:table-cell">
                      {record.grade || '-'}
                    </TableCell>
                    <TableCell className="py-3 pr-4 hidden md:table-cell">
                      {record.publishedAt
                        ? dayjs(record.publishedAt).format('YYYY-MM-DD HH:mm')
                        : '-'}
                    </TableCell>
                    <TableCell className="py-3 pr-4 hidden md:table-cell">
                      {record.publishedById ? (
                        <UserDisplay
                          value={[record.publishedById]}
                          size="small"
                        />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3 pr-4 sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l">
                      <div className="flex items-center gap-1">
                        {record.status === 'self_review' && (
                          <CanDo resource="publish_management" action="edit">
                            <ActionBadge
                              actionType="toggle"
                              label="退回"
                              onClick={() => onReturn(record)}
                            />
                          </CanDo>
                        )}
                        {[
                          'completed',
                          'supervisor_sign',
                          'pending_sign',
                          'supervisor_review',
                        ].includes(record.status) && (
                          <CanDo resource="publish_management" action="edit">
                            <ActionBadge
                              actionType="toggle"
                              label="解锁"
                              onClick={() => onUnlock(record)}
                            />
                          </CanDo>
                        )}
                        <CanDo resource="publish_management" action="view">
                          <ActionBadge
                            actionType="history"
                            label="解锁历史"
                            onClick={() => onHistory(record)}
                          />
                        </CanDo>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                第 {page} / {totalPages} 页，共 {total} 条
              </span>
              <div className="flex items-center gap-3">
                {onPageSizeChange && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="whitespace-nowrap">每页</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { onPageSizeChange(Number(v)); onPageChange(1); }}>
                      <SelectTrigger className="h-8 w-20 shrink-0 text-xs" aria-label="每页条数">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {EMPLOYEE_PAGE_SIZES.map((s) => (
                            <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {totalPages > 1 && (
              <Pagination className="w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      aria-disabled={page <= 1}
                      className={
                        page <= 1 ? 'pointer-events-none opacity-50' : ''
                      }
                      onClick={() => onPageChange(Math.max(1, page - 1))}
                    />
                  </PaginationItem>
                  {visiblePages.map((p) => (
                    <PaginationItem key={p}>
                      <PaginationLink
                        isActive={p === page}
                        onClick={() => onPageChange(p)}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      aria-disabled={page >= totalPages}
                      className={
                        page >= totalPages
                          ? 'pointer-events-none opacity-50'
                          : ''
                      }
                      onClick={() =>
                        onPageChange(Math.min(totalPages, page + 1))
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PublishedAssessmentSection;
