import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageHeader } from '@/components/business-ui/page-header';
import EmployeeListTab from './EmployeeListTab';
import DepartmentManagementTab from './DepartmentManagementTab';
import { UserCog } from 'lucide-react';

const EmployeeManagementPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="员工管理" icon={UserCog} />
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="w-full justify-start gap-0 rounded-none border-b bg-transparent p-0 h-auto">
          <TabsTrigger
            value="employees"
            className="text-sm data-[state=active]:shadow-none"
          >
            员工列表
          </TabsTrigger>
          <TabsTrigger
            value="departments"
            className="text-sm data-[state=active]:shadow-none"
          >
            部门管理
          </TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="mt-6">
          <EmployeeListTab />
        </TabsContent>
        <TabsContent value="departments" className="mt-6">
          <DepartmentManagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmployeeManagementPage;
