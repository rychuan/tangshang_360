import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmployeeListTab from './EmployeeListTab';
import DepartmentManagementTab from './DepartmentManagementTab';
import { UserCog } from 'lucide-react';

const EmployeeManagementPage: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <UserCog className="size-5 sm:size-6 text-muted-foreground" />
            员工管理
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs defaultValue="employees">
            <TabsList className="bg-muted/60">
              <TabsTrigger value="employees" className="text-xs sm:text-sm">员工列表</TabsTrigger>
              <TabsTrigger value="departments" className="text-xs sm:text-sm">部门管理</TabsTrigger>
            </TabsList>
            <TabsContent value="employees" className="mt-4">
              <EmployeeListTab />
            </TabsContent>
            <TabsContent value="departments" className="mt-4">
              <DepartmentManagementTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeManagementPage;
