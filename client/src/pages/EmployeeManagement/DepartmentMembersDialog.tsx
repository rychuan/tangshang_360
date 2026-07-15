import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { UserDisplay } from '@/components/business-ui/user-display';
import { Users } from 'lucide-react';

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

  const { data: listData, isLoading: loading } = useQuery({
    queryKey: ['employees', 'department-members', departmentName],
    queryFn: () => employeeManagement.list({ department: departmentName, page: 1, pageSize: 100 }),
    enabled: open && !!departmentName,
  });
  const members = listData?.items ?? [];
  const total = listData?.total ?? 0;

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
            <div className="flex items-center justify-center py-8">
              <Spinner className="size-5" />
            </div>
          ) : members.length === 0 ? (
            <div className="py-8">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Users className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>该部门暂无成员</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
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
                        <Badge variant="secondary" className="text-xs">
                          {roleLabels[emp.role] || emp.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-4 align-middle whitespace-nowrap">
                        {emp.status ? (
                          <Badge
                            variant="default"
                            className="bg-success/10 text-success border-transparent text-xs"
                          >
                            已启用
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            已禁用
                          </Badge>
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
