import React from 'react';
import { Button } from '@/components/ui/button';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserDisplay } from '@/components/business-ui/user-display';
import type { PublishEmployeeItem } from '@shared/api.interface';

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
  onAdjust: (emp: PublishEmployeeItem) => void;
  onDeleteSnapshot: (emp: PublishEmployeeItem) => void;
}

const LAST_PERIOD_STATUS_LABELS: Record<string, string> = {
  completed: '已完成',
  pending_sign: '待签名',
  supervisor_review: '上级评分中',
  self_review: '自评中',
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
  onAdjust,
  onDeleteSnapshot,
}) => {
  const allSelected: boolean =
    employees.length > 0 && selectedIds.size === employees.length;

  const handleDeptChange = (v: string): void => {
    onDepartmentFilterChange(v === '__all__' ? '' : v);
  };

  const handleTplChange = (v: string): void => {
    onTemplateFilterChange(v === '__all__' ? '' : v);
  };

  return (
    <div data-ai-section-type="card-list" className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">待发布员工</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm text-muted-foreground">部门</Label>
            <Select
              value={departmentFilter || '__all__'}
              onValueChange={handleDeptChange}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部部门" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部部门</SelectItem>
                {departments.map((dept: string) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm text-muted-foreground">模板</Label>
            <Select
              value={templateFilter || '__all__'}
              onValueChange={handleTplChange}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="全部模板" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">全部模板</SelectItem>
                {templates.map((t: { id: string; name: string }) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CanRole roles={['admin', 'hrd']}>
            <Button
              data-ai-section-type="button"
              disabled={selectedIds.size === 0 || publishing}
              onClick={onPublish}
            >
              {publishing ? '发布中...' : `发布选中 (${selectedIds.size})`}
            </Button>
          </CanRole>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          加载中...
        </div>
      ) : employees.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          暂无符合条件的待发布员工
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="w-10 py-3 pr-4 font-medium">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked: boolean) => onSelectAll(checked)}
                  />
                </th>
                <th className="py-3 pr-4 font-medium">员工</th>
                <th className="py-3 pr-4 font-medium">部门</th>
                <th className="py-3 pr-4 font-medium">岗位</th>
                <th className="py-3 pr-4 font-medium">考核模板</th>
                <th className="py-3 pr-4 font-medium">上月考核</th>
                <th className="py-3 pr-4 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp: PublishEmployeeItem) => (
                <tr key={emp.employeeId} className="border-b hover:bg-muted/50">
                  <td className="py-3 pr-4">
                    <Checkbox
                      checked={selectedIds.has(emp.employeeId)}
                      onCheckedChange={(checked: boolean) =>
                        onSelectOne(emp.employeeId, checked)
                      }
                    />
                  </td>
                  <td className="py-3 pr-4">
                    <UserDisplay value={[emp.employeeId]} size="small" />
                  </td>
                  <td className="py-3 pr-4">{emp.department || '-'}</td>
                  <td className="py-3 pr-4">{emp.position}</td>
                  <td className="py-3 pr-4">{emp.templateName}</td>
                  <td className="py-3 pr-4">
                    {emp.lastPeriodStatus ? (
                      <Badge variant="outline">
                        {LAST_PERIOD_STATUS_LABELS[emp.lastPeriodStatus] ||
                          emp.lastPeriodStatus}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1">
                      <CanRole roles={['admin', 'hrd']}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onAdjust(emp)}
                        >
                          调整
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => onDeleteSnapshot(emp)}
                        >
                          删除快照
                        </Button>
                      </CanRole>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PendingPublishSection;
