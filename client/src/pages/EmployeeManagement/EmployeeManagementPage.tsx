import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { department as departmentApi } from '@/api';
import type { DepartmentTreeNode } from '@shared/api.interface';
import { PageHeader } from '@/components/business-ui/page-header';
import { Button } from '@/components/ui/button';
import EmployeeListTab from './EmployeeListTab';
import { DepartmentTreePanel } from './DepartmentTreePanel';
import BitableConnectionTab from './BitableConnectionTab';
import { UserCog, Link2 } from '@/components/ui/hugeicons';
import { usePermissions } from '@/hooks/usePermissions';
import { hasPermission } from '@/components/permission-policy';

/** 在部门树中递归查找节点名称 */
function findDeptName(nodes: DepartmentTreeNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) return node.name;
    if (node.children?.length) {
      const found = findDeptName(node.children, id);
      if (found !== null) return found;
    }
  }
  return null;
}

const EmployeeManagementPage: React.FC = () => {
  const { permissions, canManageGlobalConnections } = usePermissions();
  const canViewEmployees = permissions.some(
    (p) => p.resource === 'employees' && p.actions.includes('view'),
  );
  const showDepartmentTree = hasPermission(permissions, 'organization', 'view');
  // Bitable 连接管理入口：员工查看权限 + 全局连接能力（与旧 tab 语义一致）
  const canManageBitable = canViewEmployees && canManageGlobalConnections;
  const [view, setView] = useState<'employees' | 'bitable'>('employees');

  const { data: deptData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentApi.list(),
    enabled: showDepartmentTree,
  });

  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  // 从部门树数据中解析选中节点的名称
  const selectedDeptName: string | null =
    selectedDeptId && deptData?.tree
      ? findDeptName(deptData.tree, selectedDeptId)
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
    <div className="flex flex-1 flex-col min-h-0 gap-4 md:gap-6">
      <PageHeader
        title="员工管理"
        icon={UserCog}
        visuallyHidden
        actions={
          canManageBitable ? (
            <Button
              variant={view === 'bitable' ? 'default' : 'outline'}
              size="sm"
              onClick={() =>
                setView(view === 'bitable' ? 'employees' : 'bitable')
              }
            >
              <Link2 className="size-3.5" />
              {view === 'bitable' ? '员工列表' : 'Bitable 连接'}
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-1 min-h-0 gap-4">
        {/* 左侧部门树（Bitable 视图下隐藏） */}
        {showDepartmentTree && view === 'employees' && (
          <aside className="w-[260px] shrink-0 overflow-hidden rounded-lg border bg-card">
            <DepartmentTreePanel
              selectedId={selectedDeptId}
              onSelect={handleDeptSelect}
            />
          </aside>
        )}

        {/* 右侧：员工列表 / Bitable 连接管理（员工列表仅对 employees view 可见） */}
        <section className="flex-1 min-w-0">
          {view === 'bitable' ? (
            <BitableConnectionTab />
          ) : canViewEmployees ? (
            <EmployeeListTab departmentName={selectedDeptName} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              请选择左侧部门查看组织架构
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default EmployeeManagementPage;
