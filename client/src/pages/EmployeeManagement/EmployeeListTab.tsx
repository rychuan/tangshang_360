import React, { useState, useEffect, useCallback } from 'react';
import { employeeManagement } from '@/api';
import { assessmentTemplate as templateApi } from '@/api';
import type {
  EmployeeItem,
  AssessmentTemplateItem,
  BindingHistoryItem,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import DepartmentTreeSelect from '@/components/ui/department-tree-select';
import PositionMultiSelect from './PositionMultiSelect';
import EmployeeTable from './EmployeeTable';
import EmployeeFormDialog, {
  emptyEmployeeForm,
  employeeToForm,
  formToCreateRequest,
  type EmployeeFormData,
} from './EmployeeFormDialog';
import {
  BindDialog,
  UnbindDialog,
  HistoryDialog,
} from './EmployeeDialogs';
import { toast } from 'sonner';
import { Plus, Search, Link2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { handleApiError } from '@/utils/api-error';

const PAGE_SIZE = 20;

const EmployeeListTab: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [positions, setPositions] = useState<string[]>([]);
  const [templates, setTemplates] = useState<AssessmentTemplateItem[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeItem | null>(
    null,
  );
  const [formData, setFormData] = useState<EmployeeFormData>(emptyEmployeeForm);

  const [bindOpen, setBindOpen] = useState(false);
  const [bindEmployeeIds, setBindEmployeeIds] = useState<string[]>([]);
  const [bindTemplateId, setBindTemplateId] = useState('');
  const [bindEffectiveFrom, setBindEffectiveFrom] = useState('');
  const [bindSubmitting, setBindSubmitting] = useState(false);

  const [unbindTargetId, setUnbindTargetId] = useState('');
  const [unbindOpen, setUnbindOpen] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEmployeeName, setHistoryEmployeeName] = useState('');
  const [historyItems, setHistoryItems] = useState<BindingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<EmployeeItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const res = await employeeManagement.list({
        page,
        pageSize: PAGE_SIZE,
        keyword: keyword || undefined,
        department: departmentFilter || undefined,
        positions: positionFilter.length > 0 ? positionFilter.join(',') : undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      });
      setEmployees(res.items);
      setTotal(res.total);
      setSelectedRowKeys([]);
    } catch (err: unknown) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [page, keyword, departmentFilter, positionFilter, roleFilter, statusFilter]);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await employeeManagement.getPositions();
      setPositions(res.positions);
    } catch (err: unknown) {
      handleApiError(err);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await templateApi.list({ page: 1, pageSize: 200 });
      setTemplates(res.items);
    } catch (err: unknown) {
      handleApiError(err);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const handleSave = async (): Promise<void> => {
    if (!editingEmployee && !formData.userId) {
      toast.error('请选择关联用户');
      return;
    }
    if (!formData.name || !formData.position) {
      toast.error('请填写姓名和岗位');
      return;
    }
    try {
      const payload = formToCreateRequest(formData);
      if (editingEmployee) {
        await employeeManagement.update(editingEmployee.id, payload);
        toast.success('员工信息已更新');
      } else {
        await employeeManagement.create(payload);
        toast.success('员工已创建');
      }
      setDialogOpen(false);
      setEditingEmployee(null);
      setFormData(emptyEmployeeForm);
      fetchEmployees();
    } catch (err: unknown) {
      handleApiError(err);
    }
  };

  const handleEdit = (emp: EmployeeItem): void => {
    setEditingEmployee(emp);
    setFormData(employeeToForm(emp));
    setDialogOpen(true);
  };

  const handleToggleStatus = async (emp: EmployeeItem): Promise<void> => {
    try {
      if (emp.status === 'active') {
        await employeeManagement.deactivate(emp.id);
        toast.success('员工已禁用');
      } else {
        await employeeManagement.activate(emp.id);
        toast.success('员工已启用');
      }
      fetchEmployees();
    } catch (err: unknown) {
      handleApiError(err);
    }
  };

  const openBindDialog = (ids: string[]): void => {
    if (ids.length === 0) {
      toast.error('请选择员工');
      return;
    }
    setBindEmployeeIds(ids);
    setBindTemplateId('');
    const now = new Date();
    setBindEffectiveFrom(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    );
    setBindOpen(true);
  };

  const handleBind = (emp: EmployeeItem): void => {
    openBindDialog([emp.id]);
  };

  const handleConfirmBind = async (): Promise<void> => {
    setBindSubmitting(true);
    try {
      await employeeManagement.bind({
        employeeIds: bindEmployeeIds,
        templateId: bindTemplateId,
        effectiveFrom: bindEffectiveFrom,
      });
      toast.success('绑定成功');
      setBindOpen(false);
      fetchEmployees();
    } catch (err: unknown) {
      handleApiError(err);
    } finally {
      setBindSubmitting(false);
    }
  };

  const handleUnbind = (emp: EmployeeItem): void => {
    setUnbindTargetId(emp.id);
    setUnbindOpen(true);
  };

  const handleConfirmUnbind = async (): Promise<void> => {
    try {
      await employeeManagement.unbind(unbindTargetId);
      toast.success('解绑成功');
      setUnbindOpen(false);
      fetchEmployees();
    } catch (err: unknown) {
      handleApiError(err);
    }
  };

  const handleHistory = async (emp: EmployeeItem): Promise<void> => {
    setHistoryEmployeeName(emp.name);
    setHistoryItems([]);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await employeeManagement.bindingHistory(emp.id);
      setHistoryItems(res.items);
    } catch (err: unknown) {
      handleApiError(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDelete = (emp: EmployeeItem): void => {
    setDeleteTarget(emp);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await employeeManagement.remove(deleteTarget.id);
      toast.success('员工已删除');
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchEmployees();
    } catch (err: unknown) {
      handleApiError(err);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const toggleAll = (): void => {
    if (employees.length > 0 && employees.every((e) => selectedRowKeys.includes(e.id))) {
      setSelectedRowKeys([]);
    } else {
      setSelectedRowKeys(employees.map((e) => e.id));
    }
  };

  const toggleRow = (id: string): void => {
    setSelectedRowKeys((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          共 {total} 条
          {selectedRowKeys.length > 0 && (
            <span className="ml-2 text-primary">
              已选 {selectedRowKeys.length} 项
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedRowKeys.length > 0 && (
            <CanRole roles={['admin', 'hrd']}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openBindDialog(selectedRowKeys)}
              >
                <Link2 className="mr-1 size-4" />
                批量绑定
              </Button>
            </CanRole>
          )}
          <CanRole roles={['admin']}>
            <Button
              size="sm"
              onClick={() => {
                setEditingEmployee(null);
                setFormData(emptyEmployeeForm);
                setDialogOpen(true);
              }}
            >
              <Plus className="mr-2 size-4" />
              新建员工
            </Button>
          </CanRole>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="relative min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            placeholder="搜索姓名 / 编号..."
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full">
          <DepartmentTreeSelect
            value={departmentFilter}
            onChange={(name) => {
              setDepartmentFilter(name);
              setPage(1);
            }}
            placeholder="全部部门"
          />
        </div>
        <PositionMultiSelect
          positions={positions}
          value={positionFilter}
          onChange={(v) => {
            setPositionFilter(v);
            setPage(1);
          }}
          className="w-full"
        />
        <Select
          value={roleFilter || 'all'}
          onValueChange={(v) => {
            setRoleFilter(v === 'all' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="角色" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部角色</SelectItem>
            <SelectItem value="admin">管理员</SelectItem>
            <SelectItem value="hrd">HRD</SelectItem>
            <SelectItem value="dept_head">部门负责人</SelectItem>
            <SelectItem value="supervisor">上级</SelectItem>
            <SelectItem value="employee">员工</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter || 'all'}
          onValueChange={(v) => {
            setStatusFilter(v === 'all' ? '' : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="active">已启用</SelectItem>
            <SelectItem value="inactive">已禁用</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <EmployeeTable
        employees={employees}
        loading={loading}
        selectedRowKeys={selectedRowKeys}
        onToggleAll={toggleAll}
        onToggleRow={toggleRow}
        onEdit={handleEdit}
        onBind={handleBind}
        onUnbind={handleUnbind}
        onHistory={handleHistory}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDelete}
      />

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage(Math.max(1, page - 1))}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + Math.max(1, page - 3);
              if (p > totalPages) return null;
              return (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage(Math.min(totalPages, page + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <EmployeeFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingEmployee={editingEmployee}
        formData={formData}
        setFormData={setFormData}
        onSave={handleSave}
      />
      <BindDialog
        open={bindOpen}
        onOpenChange={setBindOpen}
        bindEmployeeIds={bindEmployeeIds}
        setBindEmployeeIds={setBindEmployeeIds}
        bindTemplateId={bindTemplateId}
        setBindTemplateId={setBindTemplateId}
        bindEffectiveFrom={bindEffectiveFrom}
        setBindEffectiveFrom={setBindEffectiveFrom}
        bindSubmitting={bindSubmitting}
        onConfirm={handleConfirmBind}
        templates={templates}
      />
      <UnbindDialog
        open={unbindOpen}
        onOpenChange={setUnbindOpen}
        onConfirm={handleConfirmUnbind}
      />
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        employeeName={historyEmployeeName}
        historyItems={historyItems}
        loading={historyLoading}
      />
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="w-[95vw] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除员工</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除员工「{deleteTarget?.name}」吗？此操作不可撤销，删除后该员工的档案将被永久移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EmployeeListTab;
