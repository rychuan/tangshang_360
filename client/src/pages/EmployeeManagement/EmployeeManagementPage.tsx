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
      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees" className="text-xs sm:text-sm">
            员工列表
          </TabsTrigger>
          <TabsTrigger value="departments" className="text-xs sm:text-sm">
            部门管理
          </TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="mt-4">
          <EmployeeListTab />
        </TabsContent>
        <TabsContent value="departments" className="mt-4">
          <DepartmentManagementTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EmployeeManagementPage;
