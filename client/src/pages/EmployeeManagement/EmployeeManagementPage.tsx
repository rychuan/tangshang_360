import React, { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/business-ui/page-header';
import EmployeeListTab from './EmployeeListTab';
import DepartmentManagementTab from './DepartmentManagementTab';
import BitableConnectionTab from './BitableConnectionTab';
import { UserCog } from '@/components/ui/hugeicons';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getDefaultEmployeeManagementTab,
  getVisibleEmployeeManagementTabs,
  type EmployeeManagementTab,
} from './employee-management-permissions';

const EmployeeManagementPage: React.FC = () => {
  const { permissions, canManageGlobalConnections } = usePermissions();
  const visibleTabs = useMemo(
    () =>
      getVisibleEmployeeManagementTabs(permissions, canManageGlobalConnections),
    [canManageGlobalConnections, permissions],
  );
  const defaultTab = getDefaultEmployeeManagementTab(visibleTabs);
  const [activeTab, setActiveTab] =
    useState<EmployeeManagementTab>('employees');

  useEffect(() => {
    if (defaultTab && !visibleTabs.includes(activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, defaultTab, visibleTabs]);

  if (!defaultTab) {
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
    <div className="flex flex-col gap-6">
      <PageHeader title="员工管理" icon={UserCog} />
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as EmployeeManagementTab)}
      >
        <TabsList>
          {visibleTabs.includes('employees') && (
            <TabsTrigger value="employees" className="text-xs sm:text-sm">
              员工列表
            </TabsTrigger>
          )}
          {visibleTabs.includes('departments') && (
            <TabsTrigger value="departments" className="text-xs sm:text-sm">
              部门管理
            </TabsTrigger>
          )}
          {visibleTabs.includes('bitable') && (
            <TabsTrigger value="bitable" className="text-xs sm:text-sm">
              多维表格连接
            </TabsTrigger>
          )}
        </TabsList>
        {visibleTabs.includes('employees') && (
          <TabsContent value="employees" className="mt-4">
            <EmployeeListTab />
          </TabsContent>
        )}
        {visibleTabs.includes('departments') && (
          <TabsContent value="departments" className="mt-4">
            <DepartmentManagementTab />
          </TabsContent>
        )}
        {visibleTabs.includes('bitable') && (
          <TabsContent value="bitable" className="mt-4">
            <BitableConnectionTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default EmployeeManagementPage;
