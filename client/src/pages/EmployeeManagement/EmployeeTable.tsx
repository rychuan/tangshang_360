import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { EmployeeItem } from '@shared/api.interface';
import { ROLE_LABELS as roleLabels } from './role-utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
import { Checkbox } from '@/components/ui/checkbox';
import { UserDisplay } from '@/components/business-ui/user-display';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { DataTable } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
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
  MoreHorizontal,
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

  const stickyHeaderCol = 'sticky right-0 z-20 bg-background border-l';
  const stickyCellCol =
    'sticky right-0 z-10 bg-background group-hover:bg-muted/30 border-l';
  const cols: ColumnDef<EmployeeItem>[] = React.useMemo(() => [
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
          <UserDisplay
            value={{ user_id: row.original.id, name: row.original.name }}
            size="small"
          />
        </div>
      ),
    },
    {
      id: 'employeeNo',
      header: '编号',
      meta: {
        headerClass: 'hidden sm:table-cell',
        cellClass: 'hidden sm:table-cell',
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.employeeNo || '-'}
        </span>
      ),
    },
    {
      id: 'position',
      header: '岗位',
      meta: {
        headerClass: 'hidden md:table-cell',
        cellClass: 'hidden md:table-cell',
      },
      cell: ({ row }) => (
        <span className="truncate">{row.original.position}</span>
      ),
    },
    {
      id: 'department',
      header: '部门',
      meta: {
        headerClass: 'hidden lg:table-cell',
        cellClass: 'hidden lg:table-cell',
      },
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate">
          {row.original.department || '-'}
        </span>
      ),
    },
    {
      id: 'supervisor',
      header: '上级',
      meta: {
        headerClass: 'hidden lg:table-cell',
        cellClass: 'hidden lg:table-cell',
      },
      cell: ({ row }) =>
        row.original.supervisorId ? (
          <UserDisplay
            value={{
              user_id: row.original.supervisorId,
              name: row.original.supervisorName,
            }}
            size="small"
          />
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: 'role',
      header: '角色',
      meta: {
        headerClass: 'hidden md:table-cell',
        cellClass: 'hidden md:table-cell',
      },
      cell: ({ row }) => (
        <div className="flex items-center gap-1 flex-wrap">
          {(row.original.role || 'employee')
            .split(',')
            .filter(Boolean)
            .map((r: string) => (
              <Badge
                key={r}
                variant="secondary"
                className="text-xs font-normal"
              >
                {roleLabels[r.trim()] || r.trim()}
              </Badge>
            ))}
        </div>
      ),
    },
    {
      id: 'binding',
      header: '模板',
      meta: {
        headerClass: 'hidden lg:table-cell',
        cellClass: 'hidden lg:table-cell',
      },
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
          variant={row.original.status ? 'default' : 'secondary'}
          className="text-xs font-normal"
        >
          {row.original.status ? '在职' : '离职'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      meta: { headerClass: stickyHeaderCol, cellClass: stickyCellCol },
      header: () => <span>操作</span>,
      cell: ({ row }) => (
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <CanRole roles={['admin']}>
            <CanDo resource="employees" action="edit">
              <ActionBadge
                actionType="edit"
                icon={<Pencil className="size-3" />}
                label="编辑"
                onClick={() => onEdit(row.original)}
              />
            </CanDo>
          </CanRole>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[130px]">
              <CanRole roles={['admin', 'hrd']}>
                <CanDo resource="employee_binding" action="edit">
                  <DropdownMenuItem onClick={() => onBind(row.original)}>
                    <Link2 className="size-4" />
                    绑定模板
                  </DropdownMenuItem>
                </CanDo>
              </CanRole>
              {row.original.currentBinding && (
                <CanRole roles={['admin', 'hrd']}>
                  <CanDo resource="employee_binding" action="edit">
                    <DropdownMenuItem onClick={() => onUnbind(row.original)}>
                      <Unlink className="size-4" />
                      解绑
                    </DropdownMenuItem>
                  </CanDo>
                </CanRole>
              )}
              <DropdownMenuItem onClick={() => onHistory(row.original)}>
                <History className="size-4" />
                绑定历史
              </DropdownMenuItem>
              <CanRole roles={['admin']}>
                <CanDo resource="employees" action="edit">
                  <DropdownMenuItem
                    onClick={() => onToggleStatus(row.original)}
                  >
                    {row.original.status ? (
                      <Ban className="size-4" />
                    ) : (
                      <CheckCircle className="size-4" />
                    )}
                    {row.original.status ? '禁用' : '启用'}
                  </DropdownMenuItem>
                </CanDo>
              </CanRole>
              <CanRole roles={['admin']}>
                <CanDo resource="employees" action="delete">
                  <DropdownMenuItem
                    onClick={() => onDelete(row.original)}
                    variant="destructive"
                  >
                    <Trash2 className="size-4" />
                    删除
                  </DropdownMenuItem>
                </CanDo>
              </CanRole>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
    },
  ], [
    allChecked,
    someChecked,
    onEdit,
    onBind,
    onUnbind,
    onHistory,
    onToggleStatus,
    onDelete,
    selectedRowKeys,
    onToggleAll,
    onToggleRow,
  ]);

  return (
    <DataTable
      columns={cols}
      data={employees}
      loading={loading}
      emptyMessage="暂无员工数据"
      emptyIcon={<Users className="size-6" />}
      onRowClick={(emp) => navigate(`/employees/${emp.id}`)}
    />
  );
};

export default EmployeeTable;
