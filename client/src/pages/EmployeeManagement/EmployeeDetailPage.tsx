import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { employeeManagement } from '@/api';
import type { EmployeeDetail } from '@shared/api.interface';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { handleApiError } from '@/utils/api-error';
import { ArrowLeft, User, Building2, Star, TrendingUp, ClipboardList, CheckCircle2, Award } from 'lucide-react';

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
  const [emp, setEmp] = useState<EmployeeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const loadEmp = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await employeeManagement.detail(id);
      setEmp(data);
    } catch (err: unknown) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadEmp(); }, [loadEmp]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner className="size-8" /></div>;
  }

  if (!emp) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">员工不存在</p></div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/employees')}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{emp.name}</h1>
        <Badge className={emp.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}>
          {emp.status === 'active' ? '在职' : '已禁用'}
        </Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><User className="size-5" />基本信息</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: '姓名', value: emp.name },
              { label: '员工编号', value: emp.employeeNo || '-' },
              { label: '岗位', value: emp.position },
              { label: '职级', value: emp.title || '-' },
              { label: '部门', value: emp.department || '-' },
              { label: '角色', value: roleLabels[emp.role] || emp.role },
              { label: '手机号', value: emp.phone || '-' },
              { label: '入职日期', value: emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : '-' },
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
        <CardHeader><CardTitle className="flex items-center gap-2"><Star className="size-5" />考核统计</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {[
              { label: '历史考核', value: String(emp.stats.totalAssessments), icon: ClipboardList },
              { label: '已完成', value: String(emp.stats.completedAssessments), icon: Star },
              { label: '活跃绑定', value: String(emp.stats.activeBindings), icon: Building2 },
              { label: '平均分', value: emp.stats.avgScore != null ? emp.stats.avgScore.toFixed(1) : '-', icon: TrendingUp },
              { label: '最近等级', value: emp.stats.latestGrade || '-', icon: Star },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="text-center p-3 rounded-lg bg-muted/50">
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