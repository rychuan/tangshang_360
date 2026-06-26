import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { EmployeeItem } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { UserDisplay } from '@/components/business-ui/user-display';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Pencil,
  Ban,
  CheckCircle,
  Link2,
  Unlink,
  History,
  Trash2,
  Users,
} from 'lucide-react';

export interface EmployeeTableProps {
  employees: EmployeeItem[];
  loading: boolean;
  selectedRowKeys: string[];
  onToggleAll: () => void;
  onToggleRow: (id: string) => void;
  onEdit: (emp: EmployeeItem) => void;
  onBind: (emp: EmployeeItem) => void;
  onUnbind: (emp: EmployeeItem) => void;
  onHistory: (emp: EmployeeItem) => void;
  onToggleStatus: (emp: EmployeeItem) => void;
  onDelete: (emp: EmployeeItem) => void;
}

const roleLabels: Record<string, string> = {
  admin: '管理员',
  hrd: 'HRD',
  dept_head: '部门负责人',
  supervisor: '上级',
  employee: '员工',
};

const EmployeeTable: React.FC<EmployeeTableProps> = ({
  employees,
  loading,
  selectedRowKeys,
  onToggleAll,
  onToggleRow,
  onEdit,
  onBind,
  onUnbind,
  onHistory,
  onToggleStatus,
  onDelete,
}) => {
  const navigate = useNavigate();

  const allChecked =
    employees.length > 0 &&
    employees.every((e) => selectedRowKeys.includes(e.id));
  const someChecked =
    employees.some((e) => selectedRowKeys.includes(e.id)) && !allChecked;

  const toggleAll = (): void => {
    onToggleAll();
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap w-[40px]">
              <Checkbox
                checked={
                  allChecked ? true : someChecked ? 'indeterminate' : false
                }
                onCheckedChange={toggleAll}
              />
            </th>
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground">
              姓名
            </th>
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground hidden sm:table-cell w-[80px]">
              编号
            </th>
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell">
              岗位
            </th>
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">
              部门
            </th>
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">
              上级
            </th>
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground hidden md:table-cell w-[90px]">
              角色
            </th>
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground hidden lg:table-cell">
              模板
            </th>
            <th className="h-10 px-3 sm:px-4 text-left align-middle font-medium text-muted-foreground w-[70px]">
              状态
            </th>
            <th className="h-10 px-3 sm:px-4 text-right align-middle font-medium text-muted-foreground w-[140px]">
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b">
                <td className="py-3 px-3 sm:px-4">
                  <Skeleton className="h-4 w-4" />
                </td>
                <td className="py-3 px-3 sm:px-4">
                  <Skeleton className="h-5 w-24" />
                </td>
                <td className="py-3 px-3 sm:px-4 hidden sm:table-cell">
                  <Skeleton className="h-4 w-16" />
                </td>
                <td className="py-3 px-3 sm:px-4 hidden md:table-cell">
                  <Skeleton className="h-4 w-20" />
                </td>
                <td className="py-3 px-3 sm:px-4 hidden lg:table-cell">
                  <Skeleton className="h-4 w-16" />
                </td>
                <td className="py-3 px-3 sm:px-4 hidden lg:table-cell">
                  <Skeleton className="h-5 w-20" />
                </td>
                <td className="py-3 px-3 sm:px-4 hidden md:table-cell">
                  <Skeleton className="h-5 w-14" />
                </td>
                <td className="py-3 px-3 sm:px-4 hidden lg:table-cell">
                  <Skeleton className="h-4 w-16" />
                </td>
                <td className="py-3 px-3 sm:px-4">
                  <Skeleton className="h-5 w-14" />
                </td>
                <td className="py-3 px-3 sm:px-4">
                  <Skeleton className="h-8 w-20 ml-auto" />
                </td>
              </tr>
            ))
          ) : employees.length === 0 ? (
            <tr>
              <td colSpan={10} className="py-12">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Users className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无员工数据</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </td>
            </tr>
          ) : (
            employees.map((emp) => (
              <tr
                key={emp.id}
                className="border-b hover:bg-muted/30 transition-colors group cursor-pointer"
                onClick={() => navigate(`/employees/${emp.id}`)}
              >
                <td
                  className="py-2.5 px-3 sm:px-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selectedRowKeys.includes(emp.id)}
                    onCheckedChange={() => onToggleRow(emp.id)}
                  />
                </td>
                <td className="py-2.5 px-3 sm:px-4 font-medium">
                  <UserDisplay userId={emp.id} size="small" />
                </td>
                <td className="py-2.5 px-3 sm:px-4 text-muted-foreground hidden sm:table-cell">
                  {emp.employeeNo || '-'}
                </td>
                <td className="py-2.5 px-3 sm:px-4 hidden md:table-cell truncate">
                  {emp.position}
                </td>
                <td className="py-2.5 px-3 sm:px-4 text-muted-foreground hidden lg:table-cell truncate">
                  {emp.department || '-'}
                </td>
                <td className="py-2.5 px-3 sm:px-4 hidden lg:table-cell">
                  {emp.supervisorId ? (
                    <UserDisplay userId={emp.supervisorId} size="small" />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="py-2.5 px-3 sm:px-4 hidden md:table-cell">
                  <Badge variant="secondary" className="text-xs font-normal">
                    {roleLabels[emp.role] || emp.role}
                  </Badge>
                </td>
                <td className="py-2.5 px-3 sm:px-4 hidden lg:table-cell">
                  {emp.currentBinding ? (
                    <span className="text-xs">
                      {emp.currentBinding.templateName}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="py-2.5 px-3 sm:px-4">
                  <Badge
                    variant={emp.status === 'active' ? 'default' : 'secondary'}
                    className={`text-xs font-normal ${emp.status === 'active' ? 'bg-success/10 text-success border-transparent' : ''}`}
                  >
                    {emp.status === 'active' ? '在职' : '离职'}
                  </Badge>
                </td>
                <td
                  className="py-2.5 px-3 sm:px-4 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                    <CanRole roles={['admin']}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 sm:size-8"
                        onClick={() => onEdit(emp)}
                        title="编辑"
                      >
                        <Pencil className="size-3.5 sm:size-4" />
                      </Button>
                    </CanRole>
                    <CanRole roles={['admin', 'hrd']}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 sm:size-8 hidden sm:inline-flex"
                        onClick={() => onBind(emp)}
                        title="绑定模板"
                      >
                        <Link2 className="size-3.5 sm:size-4" />
                      </Button>
                    </CanRole>
                    {emp.currentBinding && (
                      <CanRole roles={['admin', 'hrd']}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 sm:size-8 hidden sm:inline-flex"
                          onClick={() => onUnbind(emp)}
                          title="解绑"
                        >
                          <Unlink className="size-3.5 sm:size-4 text-destructive" />
                        </Button>
                      </CanRole>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 sm:size-8 hidden sm:inline-flex"
                      onClick={() => onHistory(emp)}
                      title="绑定历史"
                    >
                      <History className="size-3.5 sm:size-4" />
                    </Button>
                    <CanRole roles={['admin']}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 sm:size-8"
                        onClick={() => onToggleStatus(emp)}
                        title={emp.status === 'active' ? '禁用' : '启用'}
                      >
                        {emp.status === 'active' ? (
                          <Ban className="size-3.5 sm:size-4 text-destructive" />
                        ) : (
                          <CheckCircle className="size-3.5 sm:size-4 text-success" />
                        )}
                      </Button>
                    </CanRole>
                    <CanRole roles={['admin']}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 sm:size-8"
                        onClick={() => onDelete(emp)}
                        title="删除"
                      >
                        <Trash2 className="size-3.5 sm:size-4 text-destructive" />
                      </Button>
                    </CanRole>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default EmployeeTable;
