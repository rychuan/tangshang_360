import React, { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { department as departmentApi } from '@/api';
import { findNodeName } from './department-tree-utils';
import { PageHeader } from '@/components/business-ui/page-header';
import { PageShell } from '@/components/business-ui/page-shell';
import EmployeeListTab from './EmployeeListTab';
import { DepartmentTreePanel } from './DepartmentTreePanel';
import { UserCog } from '@/components/ui/hugeicons';
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
      header={<PageHeader title="员工管理" icon={UserCog} visuallyHidden />}
      contentClassName="overflow-hidden"
      className="overflow-hidden"
    >
      {/* 左侧部门树（高度与员工列表一致：内容自适应 + 树区域同高计算） */}
      {showDepartmentTree && (
        <aside className="w-[260px] shrink-0 self-start overflow-hidden rounded-lg border bg-card flex flex-col">
          <DepartmentTreePanel
            selectedId={selectedDeptId}
            onSelect={handleDeptSelect}
          />
        </aside>
      )}

      {/* 右侧：员工列表（内部滚动，页面整体固定） */}
      <section className="flex-1 min-w-0 overflow-y-auto min-h-0">
        {canViewEmployees ? (
          <EmployeeListTab departmentName={selectedDeptName} />
        ) : (
          <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
            请选择左侧部门查看组织架构
          </div>
        )}
      </section>
    </PageShell>
  );
};

export default EmployeeManagementPage;
