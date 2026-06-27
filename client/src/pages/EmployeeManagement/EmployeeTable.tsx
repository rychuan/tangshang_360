import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { EmployeeItem } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { Checkbox } from '@/components/ui/checkbox';
import { UserDisplay } from '@/components/business-ui/user-display';
import { DataTable } from '@/components/ui/data-table';
import type { ColumnDef } from '@tanstack/react-table';
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

  const columns: ColumnDef<EmployeeItem>[] = [
    {
      id: 'select',
      header: () => (
        <Checkbox
          checked={allChecked ? true : someChecked ? 'indeterminate' : false}
          onCheckedChange={() => onToggleAll()}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedRowKeys.includes(row.original.id)}
          onCheckedChange={() => onToggleRow(row.original.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      size: 40,
      enableSorting: false,
    },
    {
      id: 'name',
      header: '姓名',
      cell: ({ row }) => (
        <div className="font-medium">
          <UserDisplay userId={row.original.id} size="small" />
        </div>
      ),
    },
    {
      id: 'employeeNo',
      header: '编号',
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.employeeNo || '-'}
        </span>
      ),
    },
    {
      id: 'position',
      header: '岗位',
      cell: ({ row }) => (
        <span className="truncate">{row.original.position}</span>
      ),
    },
    {
      id: 'department',
      header: '部门',
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate">
          {row.original.department || '-'}
        </span>
      ),
    },
    {
      id: 'supervisor',
      header: '上级',
      cell: ({ row }) =>
        row.original.supervisorId ? (
          <UserDisplay userId={row.original.supervisorId} size="small" />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: 'role',
      header: '角色',
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-xs font-normal">
          {roleLabels[row.original.role] || row.original.role}
        </Badge>
      ),
    },
    {
      id: 'binding',
      header: '模板',
      cell: ({ row }) =>
        row.original.currentBinding ? (
          <span className="text-xs">
            {row.original.currentBinding.templateName}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      id: 'status',
      header: '状态',
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 'active' ? 'default' : 'secondary'}
          className={`text-xs font-normal ${
            row.original.status === 'active'
              ? 'bg-success/10 text-success border-transparent'
              : ''
          }`}
        >
          {row.original.status === 'active' ? '在职' : '离职'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">操作</div>,
      cell: ({ row }) => (
        <div
          className="flex items-center justify-end gap-0.5 sm:gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <CanRole roles={['admin']}>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 sm:size-8"
              onClick={() => onEdit(row.original)}
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
              onClick={() => onBind(row.original)}
              title="绑定模板"
            >
              <Link2 className="size-3.5 sm:size-4" />
            </Button>
          </CanRole>
          {row.original.currentBinding && (
            <CanRole roles={['admin', 'hrd']}>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 sm:size-8 hidden sm:inline-flex"
                onClick={() => onUnbind(row.original)}
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
            onClick={() => onHistory(row.original)}
            title="绑定历史"
          >
            <History className="size-3.5 sm:size-4" />
          </Button>
          <CanRole roles={['admin']}>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 sm:size-8"
              onClick={() => onToggleStatus(row.original)}
              title={row.original.status === 'active' ? '禁用' : '启用'}
            >
              {row.original.status === 'active' ? (
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
              onClick={() => onDelete(row.original)}
              title="删除"
            >
              <Trash2 className="size-3.5 sm:size-4 text-destructive" />
            </Button>
          </CanRole>
        </div>
      ),
      enableSorting: false,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={employees}
      loading={loading}
      emptyMessage="暂无员工数据"
      emptyIcon={<Users className="size-6" />}
      onRowClick={(emp) => navigate(`/employees/${emp.id}`)}
    />
  );
};

export default EmployeeTable;
