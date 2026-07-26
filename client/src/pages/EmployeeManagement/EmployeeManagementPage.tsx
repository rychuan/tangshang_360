import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { department as departmentApi } from '@/api';
import type { DepartmentTreeNode } from '@shared/api.interface';
import { PageHeader } from '@/components/business-ui/page-header';
import EmployeeListTab from './EmployeeListTab';
import { DepartmentTreePanel } from './DepartmentTreePanel';
import { UserCog } from '@/components/ui/hugeicons';
import { usePermissions } from '@/hooks/usePermissions';
import { hasPermission } from '@/components/permission-policy';

/** 在部门树中递归查找节点名称 */
function findDeptName(
  nodes: DepartmentTreeNode[],
  id: string,
): string | null {
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
      <PageHeader title="员工管理" icon={UserCog} visuallyHidden />
      <div className="flex flex-1 min-h-0 gap-4">
        {/* 左侧部门树 */}
        {showDepartmentTree && (
          <aside className="w-[260px] shrink-0 overflow-hidden rounded-lg border bg-card">
            <DepartmentTreePanel
              selectedId={selectedDeptId}
              onSelect={handleDeptSelect}
            />
          </aside>
        )}

        {/* 右侧员工列表 */}
        <section className="flex-1 min-w-0">
          <EmployeeListTab departmentName={selectedDeptName} />
        </section>
      </div>
    </div>
  );
};

export default EmployeeManagementPage;
