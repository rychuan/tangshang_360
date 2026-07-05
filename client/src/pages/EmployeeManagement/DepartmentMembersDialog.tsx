import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { employeeManagement } from '@/api';
import type { EmployeeItem } from '@shared/api.interface';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@client/src/utils/api-error';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserDisplay } from '@/components/business-ui/user-display';

import { ROLE_LABELS as roleLabels } from './role-utils';

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
      setMembers(res?.items ?? []);
      setTotal(res.total);
    } catch (err: unknown) {
      logger.error('Failed to fetch department members:', err);
      handleApiError(err);
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
      <DialogContent className="w-[95vw] max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
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
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>姓名</TableHead>
                    <TableHead>编号</TableHead>
                    <TableHead>岗位</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((emp) => (
                    <TableRow
                      key={emp.id}
                      className="border-b hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/employees/${emp.id}`)}
                    >
                      <TableCell className="py-3 px-4 align-middle whitespace-nowrap font-medium">
                        <UserDisplay
                          value={{ user_id: emp.id, name: emp.name }}
                          size="small"
                        />
                      </TableCell>
                      <TableCell className="py-3 px-4 align-middle whitespace-nowrap">
                        {emp.employeeNo || '-'}
                      </TableCell>
                      <TableCell className="py-3 px-4 align-middle whitespace-nowrap">
                        {emp.position}
                      </TableCell>
                      <TableCell className="py-3 px-4 align-middle whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {roleLabels[emp.role] || emp.role}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4 align-middle whitespace-nowrap">
                        {emp.status ? (
                          <span className="text-green-600 text-xs font-medium">
                            ● 已启用
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            ● 已禁用
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DepartmentMembersDialog;
