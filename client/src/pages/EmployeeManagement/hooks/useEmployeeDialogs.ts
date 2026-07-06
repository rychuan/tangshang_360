import { useState, useCallback } from 'react';
import { employeeManagement } from '@/api';
import type {
  EmployeeItem,
  BindingHistoryItem,
  CreateEmployeeRequest,
} from '@shared/api.interface';
import { handleApiError } from '@/utils/api-error';
import { toast } from 'sonner';
import {
  emptyEmployeeForm,
  employeeToForm,
  formToCreateRequest,
  type EmployeeFormData,
} from '../EmployeeFormDialog';

/**
 * 封装员工管理页所有对话框的状态和 CRUD 操作。
 * 将原先 13 个分散的 useState 收敛到一个 hook。
 */
export function useEmployeeDialogs(refetch: () => void) {
  // ---- 表单对话框 ----
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeItem | null>(
    null,
  );
  const [formData, setFormData] = useState<EmployeeFormData>(emptyEmployeeForm);

  // ---- 绑定对话框 ----
  const [bindOpen, setBindOpen] = useState(false);
  const [bindEmployeeIds, setBindEmployeeIds] = useState<string[]>([]);
  const [bindTemplateId, setBindTemplateId] = useState('');
  const [bindSubmitting, setBindSubmitting] = useState(false);

  // ---- 解绑对话框 ----
  const [unbindOpen, setUnbindOpen] = useState(false);
  const [unbindTargetId, setUnbindTargetId] = useState('');

  // ---- 历史对话框 ----
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyEmployeeName, setHistoryEmployeeName] = useState('');
  const [historyItems, setHistoryItems] = useState<BindingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ---- 删除对话框 ----
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeItem | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // ---- 表单操作 ----
  const openCreateDialog = useCallback(() => {
    setEditingEmployee(null);
    setFormData(emptyEmployeeForm);
    setFormDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((emp: EmployeeItem) => {
    setEditingEmployee(emp);
    setFormData(employeeToForm(emp));
    setFormDialogOpen(true);
  }, []);

  const handleFormSave = useCallback(async () => {
    if (!editingEmployee && !formData.userId) {
      toast.error('请选择关联用户');
      return;
    }
    if (!formData.name || !formData.position) {
      toast.error('请填写姓名和岗位');
      return;
    }
    try {
      if (editingEmployee) {
        await employeeManagement.update(
          editingEmployee.id,
          formToCreateRequest(formData),
        );
        toast.success('员工信息已更新');
      } else {
        await employeeManagement.create(
          formToCreateRequest(formData) as CreateEmployeeRequest,
        );
        toast.success('员工创建成功');
      }
      setFormDialogOpen(false);
      refetch();
    } catch (error: unknown) {
      handleApiError(error);
    }
  }, [editingEmployee, formData, refetch]);

  // ---- 绑定操作 ----
  const openBindDialog = useCallback((emp?: EmployeeItem) => {
    setBindEmployeeIds(emp ? [emp.id] : []);
    setBindTemplateId('');
    setBindEffectiveFrom([]);
    setBindOpen(true);
  }, []);

  const openBatchBindDialog = useCallback((ids: string[]) => {
    setBindEmployeeIds(ids);
    setBindTemplateId('');
    setBindEffectiveFrom([]);
    setBindOpen(true);
  }, []);

  const handleBindConfirm = useCallback(async () => {
    if (!bindEmployeeIds.length || !bindTemplateId) {
      toast.error('请选择员工和模板');
      return;
    }
    setBindSubmitting(true);
    try {
      const now = new Date();
      const m = now.getMonth() + 1;
      await employeeManagement.bind({
        employeeIds: bindEmployeeIds,
        templateId: bindTemplateId,
        effectiveFrom: `${now.getFullYear()}-${String(m).padStart(2, '0')}`,
      });
      toast.success('绑定成功');
      setBindOpen(false);
      refetch();
    } catch (error: unknown) {
      handleApiError(error);
    } finally {
      setBindSubmitting(false);
    }
  }, [bindEmployeeIds, bindTemplateId, refetch]);

  // ---- 解绑操作 ----
  const openUnbindDialog = useCallback((emp: EmployeeItem) => {
    setUnbindTargetId(emp.id);
    setUnbindOpen(true);
  }, []);

  const handleUnbindConfirm = useCallback(async () => {
    try {
      await employeeManagement.unbind(unbindTargetId);
      toast.success('解绑成功');
      setUnbindOpen(false);
      refetch();
    } catch (error: unknown) {
      handleApiError(error);
    }
  }, [unbindTargetId, refetch]);

  // ---- 历史操作 ----
  const openHistoryDialog = useCallback(async (emp: EmployeeItem) => {
    setHistoryOpen(true);
    setHistoryEmployeeName(emp.name);
    setHistoryLoading(true);
    try {
      const res = await employeeManagement.bindingHistory(emp.id);
      setHistoryItems(res.items);
    } catch (error: unknown) {
      handleApiError(error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ---- 删除操作 ----
  const openDeleteDialog = useCallback((emp: EmployeeItem) => {
    setDeleteTarget(emp);
    setDeleteOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) {
      toast.error('删除目标为空，请重试');
      return;
    }
    setDeleteSubmitting(true);
    try {
      await employeeManagement.remove(deleteTarget.id);
      toast.success('员工已删除');
      setDeleteOpen(false);
      refetch();
    } catch (error: unknown) {
      handleApiError(error);
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteTarget, refetch]);

  // ---- 状态切换 ----
  const handleToggleStatus = useCallback(
    async (emp: EmployeeItem) => {
      try {
        if (emp.status) {
          await employeeManagement.deactivate(emp.id);
          toast.success('员工已停用');
        } else {
          await employeeManagement.activate(emp.id);
          toast.success('员工已激活');
        }
        refetch();
      } catch (error: unknown) {
        handleApiError(error);
      }
    },
    [refetch],
  );

  return {
    formDialog: {
      open: formDialogOpen,
      onOpenChange: setFormDialogOpen,
      editingEmployee,
      formData,
      setFormData,
      onSave: handleFormSave,
    },
    openCreateDialog,
    openEditDialog,

    bindDialog: {
      open: bindOpen,
      onOpenChange: setBindOpen,
      bindEmployeeIds,
      setBindEmployeeIds,
      bindTemplateId,
      setBindTemplateId,
      bindSubmitting,
      onConfirm: handleBindConfirm,
    },
    openBindDialog,
    openBatchBindDialog,

    unbindDialog: {
      open: unbindOpen,
      onOpenChange: setUnbindOpen,
      onConfirm: handleUnbindConfirm,
    },
    openUnbindDialog,

    historyDialog: {
      open: historyOpen,
      onOpenChange: setHistoryOpen,
      employeeName: historyEmployeeName,
      historyItems,
      loading: historyLoading,
    },
    openHistoryDialog,

    deleteDialog: {
      open: deleteOpen,
      onOpenChange: setDeleteOpen,
      target: deleteTarget,
      submitting: deleteSubmitting,
      onConfirm: handleDeleteConfirm,
    },
    openDeleteDialog,

    handleToggleStatus,
  };
}
