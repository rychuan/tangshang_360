import React from 'react';
import type { EmployeeItem } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Label } from '@/components/ui/label';
import { FilterBar, FilterBarActions } from '@/components/business-ui/filter-bar';
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
import EmployeeTable from './EmployeeTable';
import EmployeeFormDialog from './EmployeeFormDialog';
import { BindDialog, UnbindDialog, HistoryDialog } from './EmployeeDialogs';
import { department as departmentApi } from '@/api';
import { Plus, Search, Link2, RefreshCw } from '@/components/ui/hugeicons';
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
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { useEmployeeFilters } from './hooks/useEmployeeFilters';
import { useEmployeeList } from './hooks/useEmployeeList';
import { useEmployeeDialogs } from './hooks/useEmployeeDialogs';
import {
  COMMAND_PERMISSIONS,
  hasPermission,
} from '@/components/permission-policy';
import { getEmployeeListCapabilities } from './employee-management-permissions';
import { useTableScrollHeight } from '@/hooks/useTableScrollHeight';
import {
  EMPLOYEE_PAGE_SIZES,
  getEmployeeTotalPages,
  getEmployeeVisiblePages,
} from '@shared/employee-pagination';

interface EmployeeListTabProps {
  /** 从部门树面板传入的部门名称，覆盖内部筛选器 */
  departmentName?: string | null;
}

const EmployeeListTab: React.FC<EmployeeListTabProps> = ({
  departmentName,
}) => {
  const { tableRef, tableMaxHeight } = useTableScrollHeight();
  const [filters, setters] = useEmployeeFilters();
  const { permissions } = usePermissions();
  const { ability } = useAuth();
  const capabilities = getEmployeeListCapabilities(permissions);
  const canManageRoles =
    ability.can('admin', ROLE_SUBJECT) &&
    hasPermission(permissions, 'permission_management', 'edit');
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
    onPageOutOfRange: setters.setPage,
  });
  const dialogs = useEmployeeDialogs(refetch);

  // 部门树面板点击部门 → 联动列表筛选
  React.useEffect(() => {
    if (departmentName !== undefined) {
      setters.setDepartment(departmentName ?? '');
    }
  }, [departmentName]);

  // 部门筛选数据（下拉选项，与部门树/后端名称解析一致）
  const [departments, setDepartments] = React.useState<string[]>([]);
  React.useEffect(() => {
    let cancelled = false;
    departmentApi
      .list()
      .then((res) => {
        if (!cancelled) setDepartments(res.items.map((d) => d.name));
      })
      .catch(() => {
        /* 筛选器降级为无部门选项，不影响列表 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const totalPages = getEmployeeTotalPages(total, filters.pageSize);
  const visiblePages = getEmployeeVisiblePages(filters.page, totalPages);
  const isFirstPage = filters.page === 1;
  const isLastPage = filters.page === totalPages;

  return (
    <div className="flex flex-col gap-4 min-h-full">
      {/* 筛选条件（参考模板管理布局：每项控件带 Label，无标题文字） */}
      <FilterBar data-ai-section-type="card-list" className="gap-2">
        <div className="flex flex-col gap-0.5">
          <Label className="text-[11px] text-muted-foreground">搜索</Label>
          <InputGroup className="w-24">
            <InputGroupAddon>
              <Search className="size-3" />
            </InputGroupAddon>
            <InputGroupInput
              className="h-7 text-xs"
              placeholder="姓名/编号"
              value={filters.keyword}
              onChange={(e) => setters.setKeyword(e.target.value)}
            />
          </InputGroup>
        </div>
        <div className="flex flex-col gap-0.5">
          <Label className="text-[11px] text-muted-foreground">部门</Label>
          <Select
            value={filters.department || 'all'}
            onValueChange={(v) => setters.setDepartment(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue placeholder="全部部门" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部部门</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-0.5">
          <Label className="text-[11px] text-muted-foreground">岗位</Label>
          <Select
            value={filters.positions[0] || 'all'}
            onValueChange={(v) =>
              setters.setPositions(v === 'all' ? [] : [v])
            }
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue placeholder="全部岗位" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部岗位</SelectItem>
                {positions.map((pos) => (
                  <SelectItem key={pos} value={pos}>
                    {pos}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-0.5">
          <Label className="text-[11px] text-muted-foreground">角色</Label>
          <Select
            value={filters.role || 'all'}
            onValueChange={(v) => setters.setRole(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue placeholder="全部角色" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部角色</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
                <SelectItem value="hrd">HRD</SelectItem>
                <SelectItem value="dept_head">部门负责人</SelectItem>
                <SelectItem value="supervisor">上级</SelectItem>
                <SelectItem value="employee">员工</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-0.5">
          <Label className="text-[11px] text-muted-foreground">状态</Label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => setters.setStatus(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="true">已启用</SelectItem>
                <SelectItem value="false">已禁用</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {capabilities.showBindings && (
          <div className="flex flex-col gap-0.5">
            <Label className="text-[11px] text-muted-foreground">绩效</Label>
            <Select
              value={filters.binding || 'all'}
              onValueChange={(v) => setters.setBinding(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
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
        <FilterBarActions>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground invisible">
              占位
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              title="重置筛选"
              onClick={setters.resetFilters}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
        </FilterBarActions>
        <div className="flex-1" />
        <FilterBarActions>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-muted-foreground invisible">
              占位
            </span>
            <div className="flex items-center gap-2">
              {selectedRowKeys.length > 0 && (
                <CanDo {...COMMAND_PERMISSIONS.employeeBindingEdit}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-1.5"
                    title="批量绑定"
                    onClick={() => dialogs.openBatchBindDialog(selectedRowKeys)}
                  >
                    <Link2 className="size-3" />
                    {selectedRowKeys.length}
                  </Button>
                </CanDo>
              )}
              <CanDo resource="employees" action="edit">
                <Button
                  size="icon"
                  className="h-7 w-7"
                  title="新建员工"
                  onClick={dialogs.openCreateDialog}
                >
                  <Plus className="size-3.5" />
                </Button>
              </CanDo>
            </div>
          </div>
        </FilterBarActions>
      </FilterBar>

      {/* 员工表格 + 分页 */}
      <Card
        ref={tableRef}
        className="flex flex-col overflow-hidden"
        style={{ height: tableMaxHeight }}
      >
        <CardContent className="flex-1 overflow-y-auto min-h-0 p-0">
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
        {/* 分页：固定在卡片底部，左文右器 */}
        <div className="shrink-0 border-t px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            第 {filters.page} / {totalPages} 页，共 {total} 条
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="whitespace-nowrap">每页</span>
              <Select
                value={String(filters.pageSize)}
                onValueChange={(value) => setters.setPageSize(Number(value))}
              >
                <SelectTrigger
                  className="h-8 w-20 shrink-0 text-xs"
                  aria-label="每页条数"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {EMPLOYEE_PAGE_SIZES.map((pageSize) => (
                      <SelectItem key={pageSize} value={String(pageSize)}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {totalPages > 1 && (
              <Pagination className="w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      aria-disabled={filters.page === 1}
                      tabIndex={isFirstPage ? -1 : 0}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!isFirstPage) {
                          setters.setPage(filters.page - 1);
                        }
                      }}
                      className={`h-8 text-xs ${isFirstPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                    />
                  </PaginationItem>
                  {visiblePages.map((page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        isActive={page === filters.page}
                        onClick={(event) => {
                          event.preventDefault();
                          setters.setPage(page);
                        }}
                        className="h-8 w-8 cursor-pointer text-xs"
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      aria-disabled={filters.page === totalPages}
                      tabIndex={isLastPage ? -1 : 0}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!isLastPage) {
                          setters.setPage(filters.page + 1);
                        }
                      }}
                      className={`h-8 text-xs ${isLastPage ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        </div>
      </Card>

      {/* 表单对话框 */}
      <EmployeeFormDialog
        open={dialogs.formDialog.open}
        onOpenChange={dialogs.formDialog.onOpenChange}
        editingEmployee={dialogs.formDialog.editingEmployee}
        formData={dialogs.formDialog.formData}
        setFormData={dialogs.formDialog.setFormData}
        onSave={dialogs.formDialog.onSave}
        submitting={dialogs.formDialog.submitting}
        positions={positions}
        canManageRoles={canManageRoles}
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
