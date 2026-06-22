import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { EmployeeItem } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { Checkbox } from '@/components/ui/checkbox';
import { UserDisplay } from '@/components/business-ui/user-display';
import {
  Pencil,
  Ban,
  CheckCircle,
  Link2,
  Unlink,
  History,
  Trash2,
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
    <div className="border rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b hover:bg-muted/50 transition-colors">
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap w-[40px]">
                <Checkbox
                  checked={
                    allChecked ? true : someChecked ? 'indeterminate' : false
                  }
                  onCheckedChange={toggleAll}
                />
              </th>
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">姓名</th>
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">编号</th>
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">岗位</th>
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">部门</th>
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">角色</th>
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">当前绑定模板</th>
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">状态</th>
              <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap w-[260px] sticky right-0 bg-background z-20 border-l">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="border-b hover:bg-muted/50 transition-colors">
                <td colSpan={9} className="py-3 px-4 align-middle whitespace-nowrap text-center py-8">
                  加载中...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr className="border-b hover:bg-muted/50 transition-colors">
                <td
                  colSpan={9}
                  className="py-3 px-4 align-middle whitespace-nowrap text-center py-8 text-muted-foreground"
                >
                  暂无员工数据
                </td>
              </tr>
            ) : (
              employees.map((emp) => (
                <tr
                  key={emp.id}
                  className="border-b hover:bg-muted/50 transition-colors group cursor-pointer"
                  onClick={() => navigate(`/employees/${emp.id}`)}
                >
                  <td className="py-3 px-4 align-middle whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedRowKeys.includes(emp.id)}
                      onCheckedChange={() => onToggleRow(emp.id)}
                    />
                  </td>
                  <td className="py-3 px-4 align-middle whitespace-nowrap font-medium">
                    <UserDisplay userId={emp.id} size="small" />
                  </td>
                  <td className="py-3 px-4 align-middle whitespace-nowrap">{emp.employeeNo || '-'}</td>
                  <td className="py-3 px-4 align-middle whitespace-nowrap">{emp.position}</td>
                  <td className="py-3 px-4 align-middle whitespace-nowrap">{emp.department || '-'}</td>
                  <td className="py-3 px-4 align-middle whitespace-nowrap">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {roleLabels[emp.role] || emp.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 align-middle whitespace-nowrap">
                    {emp.currentBinding ? (
                      <span className="text-sm">
                        {emp.currentBinding.templateName}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 align-middle whitespace-nowrap">
                    {emp.status === 'active' ? (
                      <span className="text-green-600 text-xs font-medium">
                        ● 已启用
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        ● 已禁用
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 align-middle whitespace-nowrap sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <CanRole roles={['admin']}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(emp)}
                          title="编辑"
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </CanRole>
                      <CanRole roles={['admin', 'hrd']}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onBind(emp)}
                          title="绑定模板"
                        >
                          <Link2 className="size-4" />
                        </Button>
                      </CanRole>
                      {emp.currentBinding && (
                        <CanRole roles={['admin', 'hrd']}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onUnbind(emp)}
                            title="解绑"
                          >
                            <Unlink className="size-4 text-red-500" />
                          </Button>
                        </CanRole>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onHistory(emp)}
                        title="绑定历史"
                      >
                        <History className="size-4" />
                      </Button>
                      <CanRole roles={['admin']}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onToggleStatus(emp)}
                          title={emp.status === 'active' ? '禁用' : '启用'}
                        >
                          {emp.status === 'active' ? (
                            <Ban className="size-4 text-red-500" />
                          ) : (
                            <CheckCircle className="size-4 text-green-500" />
                          )}
                        </Button>
                      </CanRole>
                      <CanRole roles={['admin']}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(emp)}
                          title="删除"
                        >
                          <Trash2 className="size-4 text-red-500" />
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
    </div>
  );
};

export default EmployeeTable;
