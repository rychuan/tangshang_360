import React from 'react';
import { useTableScrollHeight } from '@/hooks/useTableScrollHeight';
import { Button } from '@/components/ui/button';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { CanDo } from '@/hooks/usePermissions';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
} from '@/components/ui/select';
import { UserDisplay } from '@/components/business-ui/user-display';
import type { PublishEmployeeItem } from '@shared/api.interface';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Award,
  Settings2,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from '@/components/ui/hugeicons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PendingPublishSectionProps {
  employees: PublishEmployeeItem[];
  loading: boolean;
  selectedIds: Set<string>;
  onSelectAll: (checked: boolean) => void;
  onSelectOne: (employeeId: string, checked: boolean) => void;
  onPublish: () => void;
  publishing: boolean;
  departmentFilter: string;
  onDepartmentFilterChange: (value: string) => void;
  templateFilter: string;
  onTemplateFilterChange: (value: string) => void;
  departments: string[];
  templates: Array<{ id: string; name: string }>;
  period: string;
  onAdjust: (emp: PublishEmployeeItem) => void;
  onDeleteSnapshot: (emp: PublishEmployeeItem) => void;
  /** 分页 */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

const LAST_PERIOD_STATUS_LABELS: Record<string, string> = {
  completed: '已完成',
  supervisor_sign: '上级步骤中',
  pending_sign: '员工步骤中',
  supervisor_review: '上级评分中',
  self_review: '员工评分中',
  draft: '草稿',
};

const PendingPublishSection: React.FC<PendingPublishSectionProps> = ({
  employees,
  loading,
  selectedIds,
  onSelectAll,
  onSelectOne,
  onPublish,
  publishing,
  departmentFilter,
  onDepartmentFilterChange,
  templateFilter,
  onTemplateFilterChange,
  departments,
  templates,
  period,
  onAdjust,
  onDeleteSnapshot,
  page,
  pageSize,
  total,
  onPageChange,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = (page - 1) * pageSize;
  const slicedEmployees = employees.slice(startIdx, startIdx + pageSize);

  const allSelectedOnPage: boolean =
    slicedEmployees.length > 0 &&
    slicedEmployees.every((e) => selectedIds.has(e.employeeId));

  const handleDeptChange = (v: string): void => {
    onDepartmentFilterChange(v === '__all__' ? '' : v);
  };

  const handleTplChange = (v: string): void => {
    onTemplateFilterChange(v === '__all__' ? '' : v);
  };
  const { tableRef, tableMaxHeight } = useTableScrollHeight();

  return (
    <div
      ref={tableRef}
      data-ai-section-type="card-list"
      className="rounded-lg border bg-card p-6"
    >
      <div className="shrink-0 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">待发布员工</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm text-muted-foreground">
              部门
            </Label>
            <Select
              value={departmentFilter || '__all__'}
              onValueChange={handleDeptChange}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部部门" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__all__">全部部门</SelectItem>
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
              模板
            </Label>
            <Select
              value={templateFilter || '__all__'}
              onValueChange={handleTplChange}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部模板" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__all__">全部模板</SelectItem>
                  {templates.map((t: { id: string; name: string }) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <CanDo resource="publish_management" action="publish">
            <Button
              data-ai-section-type="button"
              disabled={selectedIds.size === 0 || publishing}
              onClick={onPublish}
            >
              {publishing ? '发布中...' : `发布选中 (${selectedIds.size})`}
            </Button>
          </CanDo>
        </div>
      </div>

      <div style={{ maxHeight: tableMaxHeight }} className="overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner />
          </div>
        ) : slicedEmployees.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Award className="size-6" />
              </EmptyMedia>
              <EmptyTitle>暂无符合条件的待发布员工</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow className="border-b text-left text-muted-foreground">
                <TableHead className="w-10 py-3 pr-4 font-medium">
                  <Checkbox
                    checked={allSelectedOnPage}
                    onCheckedChange={(checked: boolean) => onSelectAll(checked)}
                  />
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium">员工</TableHead>
                <TableHead className="py-3 pr-4 font-medium hidden sm:table-cell">
                  部门
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium hidden sm:table-cell">
                  岗位
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium hidden md:table-cell">
                  绩效模板
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium hidden md:table-cell">
                  周期
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium hidden md:table-cell">
                  上月绩效
                </TableHead>
                <TableHead className="py-3 pr-4 font-medium sticky right-0 bg-background z-20 border-l">
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slicedEmployees.map((emp: PublishEmployeeItem) => (
                <TableRow
                  key={emp.employeeId}
                  className="border-b hover:bg-muted/50"
                >
                  <TableCell className="py-3 pr-4">
                    <Checkbox
                      checked={selectedIds.has(emp.employeeId)}
                      onCheckedChange={(checked: boolean) =>
                        onSelectOne(emp.employeeId, checked)
                      }
                    />
                  </TableCell>
                  <TableCell className="py-3 pr-4">
                    <UserDisplay value={[emp.employeeId]} size="small" />
                  </TableCell>
                  <TableCell className="py-3 pr-4 hidden sm:table-cell">
                    {emp.department || '-'}
                  </TableCell>
                  <TableCell className="py-3 pr-4 hidden sm:table-cell">
                    {emp.position}
                  </TableCell>
                  <TableCell className="py-3 pr-4 hidden md:table-cell">
                    {emp.templateName}
                  </TableCell>
                  <TableCell className="py-3 pr-4 hidden md:table-cell">
                    {period}
                  </TableCell>
                  <TableCell className="py-3 pr-4 hidden md:table-cell">
                    {emp.lastPeriodStatus ? (
                      <Badge variant="outline">
                        {LAST_PERIOD_STATUS_LABELS[emp.lastPeriodStatus] ||
                          emp.lastPeriodStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 pr-4 sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l">
                    <div className="flex items-center gap-1">
                      <CanDo resource="publish_management" action="edit">
                        <ActionBadge
                          actionType="edit"
                          icon={<Settings2 className="size-3" />}
                          label="调整"
                          onClick={() => onAdjust(emp)}
                        />
                      </CanDo>
                      <CanDo resource="publish_management" action="edit">
                        <ActionBadge
                          actionType="delete"
                          icon={<Trash2 className="size-3" />}
                          label="删除快照"
                          onClick={() => onDeleteSnapshot(emp)}
                        />
                      </CanDo>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {totalPages > 1 && (
        <div className="shrink-0 mt-4 flex items-center justify-between border-t pt-4">
          <span className="text-sm text-muted-foreground">共 {total} 条</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <ChevronLeft data-icon="inline-start" />
              上一页
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            >
              下一页
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingPublishSection;
