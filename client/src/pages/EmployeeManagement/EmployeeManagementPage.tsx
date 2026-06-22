import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import EmployeeListTab from './EmployeeListTab';
import DepartmentManagementTab from './DepartmentManagementTab';

const EmployeeManagementPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">员工管理</h1>
      <Tabs defaultValue="employees">
        <TabsList className="bg-[#dbdbdb]">
          <TabsTrigger value="employees">员工列表</TabsTrigger>
          <TabsTrigger value="departments">部门管理</TabsTrigger>
        </TabsList>
        <TabsContent value="employees">
          <EmployeeListTab />
        </TabsContent>
        <TabsContent value="departments">
          <DepartmentManagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmployeeManagementPage;
