import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeManagement } from '@/api';
import type { EmployeeItem } from '@shared/api.interface';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserDisplay } from '@/components/business-ui/user-display';

const roleLabels: Record<string, string> = {
  admin: '管理员',
  hrd: 'HRD',
  dept_head: '部门负责人',
  supervisor: '上级',
  employee: '员工',
};

interface DepartmentMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentName: string;
}

const DepartmentMembersDialog: React.FC<DepartmentMembersDialogProps> = ({
  open,
  onOpenChange,
  departmentName,
}) => {
  const navigate = useNavigate();
  const [members, setMembers] = useState<EmployeeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!departmentName) return;
    setLoading(true);
    try {
      const res = await employeeManagement.list({
        department: departmentName,
        page: 1,
        pageSize: 100,
      });
      setMembers(res.items);
      setTotal(res.total);
    } catch {
      setMembers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [departmentName]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            「{departmentName}」部门成员（共 {total} 人）
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">加载中...</p>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              该部门暂无成员
            </p>
          ) : (
            <div className="border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">姓名</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">编号</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">岗位</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">角色</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((emp) => (
                    <tr
                      key={emp.id}
                      className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/employees/${emp.id}`)}
                    >
                      <td className="py-3 px-4 align-middle whitespace-nowrap font-medium">
                        <UserDisplay userId={emp.id} size="small" />
                      </td>
                      <td className="py-3 px-4 align-middle whitespace-nowrap">
                        {emp.employeeNo || '-'}
                      </td>
                      <td className="py-3 px-4 align-middle whitespace-nowrap">
                        {emp.position}
                      </td>
                      <td className="py-3 px-4 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {roleLabels[emp.role] || emp.role}
                        </span>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DepartmentMembersDialog;
