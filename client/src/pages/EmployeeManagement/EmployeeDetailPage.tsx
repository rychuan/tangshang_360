import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import { employeeManagement } from '@/api';
import type { EmployeeDetail } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { handleApiError } from '@/utils/api-error';
import { usePermission } from '@/hooks/usePermissions';
import {
  ArrowLeft,
  User,
  Building2,
  Star,
  TrendingUp,
  ClipboardList,
  CheckCircle2,
  Award,
} from '@/components/ui/hugeicons';

const roleLabels: Record<string, string> = {
  admin: '系统管理员',
  hrd: 'HRD',
  dept_head: '部门负责人',
  supervisor: '上级',
  employee: '员工',
};

const EmployeeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canViewBindings = usePermission('employee_binding', 'view');
  const { data: emp, isLoading } = useQuery({
    queryKey: queryKeys.employees.detail(id!),
    queryFn: () => employeeManagement.detail(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!emp) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">员工不存在</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/employees')}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
          {emp.name}
        </h1>
        <Badge
          className={
            emp.status
              ? 'bg-success/10 text-success'
              : 'bg-muted text-muted-foreground'
          }
        >
          {emp.status ? '在职' : '已禁用'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="size-5" />
            基本信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '姓名', value: emp.name },
              { label: '员工编号', value: emp.employeeNo || '-' },
              { label: '岗位', value: emp.position },
              { label: '职级', value: emp.title || '-' },
              { label: '部门', value: emp.department || '-' },
              {
                label: '角色',
                value: (
                  <div className="flex flex-wrap items-center gap-1">
                    {(emp.role || 'employee')
                      .split(',')
                      .filter(Boolean)
                      .map((r: string) => (
                        <Badge
                          key={r}
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          {roleLabels[r.trim()] || r.trim()}
                        </Badge>
                      ))}
                  </div>
                ),
              },
              { label: '手机号', value: emp.phone || '-' },
              {
                label: '入职日期',
                value: emp.hireDate
                  ? new Date(emp.hireDate).toLocaleDateString()
                  : '-',
              },
              { label: '试用期(月)', value: String(emp.probationMonths) },
            ].map((f) => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground">{f.label}</p>
                <p className="text-sm font-medium">{f.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="size-5" />
            绩效统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {[
              {
                label: '历史绩效',
                value: String(emp.stats.totalAssessments),
                icon: ClipboardList,
              },
              {
                label: '已完成',
                value: String(emp.stats.completedAssessments),
                icon: Star,
              },
              ...(canViewBindings && emp.stats.activeBindings != null
                ? [
                    {
                      label: '活跃绑定',
                      value: String(emp.stats.activeBindings),
                      icon: Building2,
                    },
                  ]
                : []),
              {
                label: '平均分',
                value:
                  emp.stats.avgScore != null
                    ? emp.stats.avgScore.toFixed(1)
                    : '-',
                icon: TrendingUp,
              },
              {
                label: '最近等级',
                value: emp.stats.latestGrade || '-',
                icon: Star,
              },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="text-center p-3 rounded-lg bg-muted/50"
                >
                  <Icon className="size-5 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-semibold">{s.value}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmployeeDetailPage;
