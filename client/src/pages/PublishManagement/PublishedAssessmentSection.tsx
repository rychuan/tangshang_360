import React from 'react';
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
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
import { UserDisplay } from '@/components/business-ui/user-display';
import { Unlock, Send, Download, Award } from 'lucide-react';
import dayjs from 'dayjs';
import type { AssessmentInstanceItem } from '@shared/api.interface';
import { StatusBadge } from '@/components/business-ui/status-badge';
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

interface PublishedAssessmentSectionProps {
  instances: AssessmentInstanceItem[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
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
  onBatchUnlock: () => void;
  onBatchNotify: () => void;
  onExport: () => void;
  batchUnlockLoading: boolean;
  batchNotifyLoading: boolean;
  departments: string[];
}

const PublishedAssessmentSection: React.FC<PublishedAssessmentSectionProps> = ({
  instances,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
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
  onBatchUnlock,
  onBatchNotify,
  onExport,
  batchUnlockLoading,
  batchNotifyLoading,
  departments,
}) => {
  const totalPages = Math.ceil(total / pageSize);
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

  return (
    <div
      data-ai-section-type="card-list"
      className="rounded-lg border bg-card p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">已发布绩效</h2>
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
                  <SelectItem value="self_review">自评中</SelectItem>
                  <SelectItem value="supervisor_review">上级评分中</SelectItem>
                  <SelectItem value="pending_sign">待签名</SelectItem>
                  <SelectItem value="completed">已完成</SelectItem>
                  <SelectItem value="draft">草稿</SelectItem>
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
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-accent px-4 py-2">
          <span className="text-sm font-medium">
            已选择 {selectedInstanceIds.size} 项
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onBatchUnlock}
              disabled={batchUnlockLoading}
            >
              <Unlock data-icon="inline-start" />
              {batchUnlockLoading ? '解锁中...' : '批量解锁'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onBatchNotify}
              disabled={batchNotifyLoading}
            >
              <Send data-icon="inline-start" />
              {batchNotifyLoading ? '发送中...' : '批量通知'}
            </Button>
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download data-icon="inline-start" />
              导出列表
            </Button>
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
          <Table>
            <TableHeader>
              <TableRow className="border-b text-muted-foreground">
                <TableHead className="w-10 py-3 pr-4 font-medium">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked: boolean) =>
                      handleSelectAll(checked)
                    }
                  />
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium text-left">
                  员工
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
                <TableHead className="py-3 pr-4 font-medium text-center hidden sm:table-cell">
                  等级
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium text-left hidden md:table-cell">
                  发布时间
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium text-left hidden md:table-cell">
                  发布人
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium text-left">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instances.map((record: AssessmentInstanceItem) => (
                <TableRow
                  key={record.id}
                  className="border-b hover:bg-muted/50"
                >
                  <TableCell className="py-3 pr-4">
                    <Checkbox
                      checked={selectedInstanceIds.has(record.id)}
                      onCheckedChange={(checked: boolean) =>
                        handleSelectOne(record.id, checked)
                      }
                    />
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <UserDisplay value={[record.employeeId]} size="small" />
                  </TableCell>
                  <TableCell className="py-3 pr-4 hidden md:table-cell">
                    {record.department}
                  </TableCell>
                  <TableCell className="py-3 pr-4 hidden lg:table-cell">
                    {record.position}
                  </TableCell>
                  <TableCell className="py-3 pr-4 hidden lg:table-cell">
                    {record.supervisorId ? (
                      <UserDisplay value={[record.supervisorId]} size="small" />
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
                  <TableCell className="py-3 pr-4 text-center hidden sm:table-cell">
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
                  <TableCell className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      {[
                        'completed',
                        'pending_sign',
                        'supervisor_review',
                      ].includes(record.status) && (
                        <CanRole roles={['admin', 'hrd']}>
                          <CanDo resource="publish_management" action="edit">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onUnlock(record)}
                            >
                              解锁
                            </Button>
                          </CanDo>
                        </CanRole>
                      )}
                      <CanRole roles={['admin', 'hrd']}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onHistory(record)}
                        >
                          解锁历史
                        </Button>
                      </CanRole>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-sm text-muted-foreground">
                共 {total} 条
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PublishedAssessmentSection;
