import React from 'react';
import type { EmployeeItem } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
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
import EmployeeFormDialog from './EmployeeFormDialog';
import { BindDialog, UnbindDialog, HistoryDialog } from './EmployeeDialogs';
import {
  Plus,
  Search,
  Link2,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { handleApiError } from '@client/src/utils/api-error';
import { importFromBitable, exportToBitable } from '@/api/bitable-sync';
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
import { CanDo, usePermissions } from '@/hooks/usePermissions';
import { useEmployeeFilters } from './hooks/useEmployeeFilters';
import { useEmployeeList } from './hooks/useEmployeeList';
import { useEmployeeDialogs } from './hooks/useEmployeeDialogs';
import { COMMAND_PERMISSIONS } from '@/components/permission-policy';
import { getEmployeeListCapabilities } from './employee-management-permissions';

const PAGE_SIZE = 20;

const EmployeeListTab: React.FC = () => {
  const [syncLoading, setSyncLoading] = React.useState<
    '' | 'import' | 'export'
  >('');
  const [filters, setters] = useEmployeeFilters();
  const { permissions } = usePermissions();
  const capabilities = getEmployeeListCapabilities(permissions);
  const {
    employees,
    total,
    loading,
    positions,
    templates,
    selectedRowKeys,
    setSelectedRowKeys,
    refetch,
  } = useEmployeeList(filters, {
    loadTemplates: capabilities.loadTemplates,
  });
  const dialogs = useEmployeeDialogs(refetch);

  const toggleAll = (): void => {
    if (
      employees.length > 0 &&
      employees.every((e) => selectedRowKeys.includes(e.id))
    ) {
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

  const handleSync = async (direction: 'import' | 'export'): Promise<void> => {
    setSyncLoading(direction);
    try {
      const fn = direction === 'import' ? importFromBitable : exportToBitable;
      const result = await fn();
      toast.success(result.message);
      refetch();
    } catch (err) {
      handleApiError(err);
    } finally {
      setSyncLoading('');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部统计 + 批量操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" />共{' '}
          <span className="font-semibold text-foreground">{total}</span> 条
          {selectedRowKeys.length > 0 && (
            <span className="ml-1 text-primary font-medium">
              · 已选 {selectedRowKeys.length} 项
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedRowKeys.length > 0 && (
            <CanDo {...COMMAND_PERMISSIONS.employeeBindingEdit}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => dialogs.openBatchBindDialog(selectedRowKeys)}
              >
                <Link2 data-icon="inline-start" />
                批量绑定
              </Button>
            </CanDo>
          )}
          <CanDo {...COMMAND_PERMISSIONS.employeeSync}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSync('import')}
              disabled={syncLoading !== ''}
            >
              <ArrowDownToLine data-icon="inline-start" />
              {syncLoading === 'import' && <Spinner className="mr-2 size-4" />}
              从多维表格导入
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSync('export')}
              disabled={syncLoading !== ''}
            >
              <ArrowUpFromLine data-icon="inline-start" />
              {syncLoading === 'export' && <Spinner className="mr-2 size-4" />}
              导出到多维表格
            </Button>
          </CanDo>
          <CanDo resource="employees" action="edit">
            <Button size="sm" onClick={dialogs.openCreateDialog}>
              <Plus data-icon="inline-start" />
              新建员工
            </Button>
          </CanDo>
        </div>
      </div>

      {/* 筛选条件 */}
      <Card className="rounded-xl">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">搜索</Label>
              <InputGroup>
                <InputGroupAddon>
                  <Search className="size-3.5" />
                </InputGroupAddon>
                <InputGroupInput
                  className="w-40"
                  placeholder="姓名/编号"
                  value={filters.keyword}
                  onChange={(e) => setters.setKeyword(e.target.value)}
                />
              </InputGroup>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">部门</Label>
              <DepartmentTreeSelect
                value={filters.department}
                onChange={(name) => setters.setDepartment(name)}
                placeholder="全部部门"
                className="w-36"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">岗位</Label>
              <PositionMultiSelect
                positions={positions}
                value={filters.positions}
                onChange={(v) => setters.setPositions(v)}
                className="w-36"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">角色</Label>
              <Select
                value={filters.role || 'all'}
                onValueChange={(v) => setters.setRole(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-28 h-9 text-sm">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                    <SelectItem value="hrd">HRD</SelectItem>
                    <SelectItem value="dept_head">部门负责人</SelectItem>
                    <SelectItem value="supervisor">上级</SelectItem>
                    <SelectItem value="employee">员工</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">状态</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) => setters.setStatus(v === 'all' ? '' : v)}
              >
                <SelectTrigger className="w-24 h-9 text-sm">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">全部</SelectItem>
                    <SelectItem value="true">已启用</SelectItem>
                    <SelectItem value="false">已禁用</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {capabilities.showBindings && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">
                  参与绩效
                </Label>
                <Select
                  value={filters.binding || 'all'}
                  onValueChange={(v) =>
                    setters.setBinding(v === 'all' ? '' : v)
                  }
                >
                  <SelectTrigger className="w-30 h-9 text-sm">
                    <SelectValue placeholder="全部" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">全部</SelectItem>
                      <SelectItem value="bound">已参与</SelectItem>
                      <SelectItem value="unbound">未参与</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 员工表格 */}
      <Card>
        <CardContent className="p-0">
          <EmployeeTable
            employees={employees}
            loading={loading}
            selectedRowKeys={selectedRowKeys}
            onToggleAll={toggleAll}
            onToggleRow={toggleRow}
            onEdit={dialogs.openEditDialog}
            onBind={dialogs.openBindDialog}
            onUnbind={dialogs.openUnbindDialog}
            onHistory={dialogs.openHistoryDialog}
            onToggleStatus={dialogs.handleToggleStatus}
            onDelete={dialogs.openDeleteDialog}
            showBindings={capabilities.showBindings}
            showSelection={capabilities.showSelection}
            showActions={capabilities.showActions}
          />
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setters.setPage(Math.max(1, filters.page - 1))}
                  className="h-8 sm:h-9 text-xs sm:text-sm"
                />
              </PaginationItem>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(
                  1,
                  Math.min(filters.page - 2, totalPages - 4),
                );
                const p = start + i;
                if (p > totalPages) return null;
                return (
                  <PaginationItem key={p}>
                    <PaginationLink
                      isActive={p === filters.page}
                      onClick={() => setters.setPage(p)}
                      className="h-8 w-8 sm:h-9 sm:w-9 text-xs sm:text-sm"
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setters.setPage(Math.min(totalPages, filters.page + 1))
                  }
                  className="h-8 sm:h-9 text-xs sm:text-sm"
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* 表单对话框 */}
      <EmployeeFormDialog
        open={dialogs.formDialog.open}
        onOpenChange={dialogs.formDialog.onOpenChange}
        editingEmployee={dialogs.formDialog.editingEmployee}
        formData={dialogs.formDialog.formData}
        setFormData={dialogs.formDialog.setFormData}
        onSave={dialogs.formDialog.onSave}
        positions={positions}
      />

      {/* 绑定对话框 */}
      <BindDialog
        open={dialogs.bindDialog.open}
        onOpenChange={dialogs.bindDialog.onOpenChange}
        bindEmployeeIds={dialogs.bindDialog.bindEmployeeIds}
        setBindEmployeeIds={dialogs.bindDialog.setBindEmployeeIds}
        bindTemplateId={dialogs.bindDialog.bindTemplateId}
        setBindTemplateId={dialogs.bindDialog.setBindTemplateId}
        bindSubmitting={dialogs.bindDialog.bindSubmitting}
        onConfirm={dialogs.bindDialog.onConfirm}
        templates={templates}
      />

      {/* 解绑对话框 */}
      <UnbindDialog
        open={dialogs.unbindDialog.open}
        onOpenChange={dialogs.unbindDialog.onOpenChange}
        onConfirm={dialogs.unbindDialog.onConfirm}
      />

      {/* 历史对话框 */}
      <HistoryDialog
        open={dialogs.historyDialog.open}
        onOpenChange={dialogs.historyDialog.onOpenChange}
        employeeName={dialogs.historyDialog.employeeName}
        historyItems={dialogs.historyDialog.historyItems}
        loading={dialogs.historyDialog.loading}
      />

      {/* 删除确认 */}
      <AlertDialog
        open={dialogs.deleteDialog.open}
        onOpenChange={dialogs.deleteDialog.onOpenChange}
      >
        <AlertDialogContent className="w-[95vw] max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除员工</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除员工「{dialogs.deleteDialog.target?.name}
              」吗？此操作不可撤销，删除后该员工的档案将被永久移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dialogs.deleteDialog.submitting}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={dialogs.deleteDialog.onConfirm}
              disabled={dialogs.deleteDialog.submitting}
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
