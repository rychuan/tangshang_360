import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { department as departmentApi } from '@/api';
import { findNodeName } from './department-tree-utils';
import { PageHeader } from '@/components/business-ui/page-header';
import { PageShell } from '@/components/business-ui/page-shell';
import EmployeeListTab from './EmployeeListTab';
import { DepartmentTreePanel } from './DepartmentTreePanel';
import { UserCog, Building2 } from '@/components/ui/hugeicons';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { usePermissions } from '@/hooks/usePermissions';
import { hasPermission } from '@/components/permission-policy';

const EmployeeManagementPage: React.FC = () => {
  const { permissions } = usePermissions();
  const canViewEmployees = permissions.some(
    (p) => p.resource === 'employees' && p.actions.includes('view'),
  );
  const showDepartmentTree = hasPermission(permissions, 'organization', 'view');

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentApi.list(),
    enabled: showDepartmentTree,
  });

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  // 移动端部门树抽屉（窄屏时左侧固定面板收起为抽屉）
  const [treeSheetOpen, setTreeSheetOpen] = useState(false);

  // 从部门树数据中解析选中节点的名称
  const selectedDeptName: string | null =
    selectedDeptId && deptData?.tree
      ? findNodeName(deptData.tree, selectedDeptId)
      : null;

  const handleDeptSelect = useCallback((id: string | null) => {
    setSelectedDeptId(id);
  }, []);

  if (!canViewEmployees && !showDepartmentTree) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-muted-foreground">403</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            您没有权限访问员工管理资源
          </p>
        </div>
      </div>
    );
  }

  return (
    <PageShell
      header={
        <div className="flex items-center justify-between gap-2">
          <PageHeader title="员工管理" icon={UserCog} visuallyHidden />
          {/* 移动端入口：窄屏时部门树收起为抽屉 */}
          {showDepartmentTree && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 lg:hidden"
              onClick={() => setTreeSheetOpen(true)}
            >
              <Building2 className="size-4" />
              <span className="max-w-40 truncate">
                {selectedDeptName || '选择部门'}
              </span>
            </Button>
          )}
        </div>
      }
      contentClassName="overflow-hidden"
      className="h-full overflow-hidden"
    >
      {/* 左侧部门树（高度与员工列表一致：内容自适应 + 树区域同高计算；
          仅 lg 及以上屏宽显示，窄屏收起为抽屉） */}
      {showDepartmentTree && (
        <aside className="hidden lg:flex w-[300px] shrink-0 self-start overflow-hidden rounded-lg border bg-card flex-col">
          <DepartmentTreePanel
            selectedId={selectedDeptId}
            onSelect={handleDeptSelect}
          />
        </aside>
      )}

      {/* 右侧：员工列表（内部滚动，页面整体固定） */}
      <section className="flex-1 min-w-0 overflow-y-auto overscroll-contain min-h-0">
        {canViewEmployees ? (
          <EmployeeListTab departmentName={selectedDeptName} />
        ) : (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            请选择左侧部门查看组织架构
          </div>
        )}
      </section>

      {/* 移动端部门树抽屉（lg 以下屏宽使用；选中后自动收起） */}
      {showDepartmentTree && (
        <Sheet open={treeSheetOpen} onOpenChange={setTreeSheetOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-sm gap-0 p-0">
            <SheetHeader className="border-b px-4 py-3">
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Building2 className="size-4 text-muted-foreground" />
                部门树
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1">
              <DepartmentTreePanel
                selectedId={selectedDeptId}
                onSelect={(id) => {
                  handleDeptSelect(id);
                  setTreeSheetOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </PageShell>
  );
};

export default EmployeeManagementPage;
