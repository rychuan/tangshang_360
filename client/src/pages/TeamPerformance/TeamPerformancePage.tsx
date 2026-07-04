import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from 'recharts';
import {
  Users,
  Clock,
  Star,
  TrendingUp,
  Eye,
  Bell,
  BarChart3Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
import { handleApiError } from '@/utils/api-error';
import { PageHeader } from '@/components/business-ui/page-header';
import { StatusBadge, GradeBadge } from '@/components/business-ui/status-badge';
import { PageTable } from '@/components/business-ui/page-table';
import type { PageTableColumn } from '@/components/business-ui/page-table';
import * as teamPerformanceApi from '@/api/team-performance';
import type {
  TeamOverviewResponse,
  SubordinateRecord,
} from '@shared/api.interface';

const PAGE_SIZE = 10;

const chartConfig = {
  count: { label: '人数', color: 'hsl(var(--chart-1))' },
};

const gradeChartColors: Record<string, string> = {
  S: 'hsl(var(--chart-5))',
  A: 'hsl(var(--chart-1))',
  B: 'hsl(var(--chart-3))',
  C: 'hsl(var(--chart-4))',
  D: 'hsl(var(--chart-2))',
};

const cardDefs: Array<{
  key: string;
  icon: React.FC<{ className?: string }>;
  label: string;
  iconBgClass: string;
  getValue: (o: TeamOverviewResponse | null) => string;
}> = [
  {
    key: 'total',
    icon: Users,
    label: '下属人数',
    iconBgClass: 'bg-primary/10 text-primary',
    getValue: (o) => String(o?.totalSubordinates ?? 0),
  },
  {
    key: 'pendingSelf',
    icon: Clock,
    label: '待自评',
    iconBgClass: 'bg-info/10 text-info',
    getValue: (o) => String(o?.waitingSelfReview ?? o?.pendingSelfCount ?? 0),
  },
  {
    key: 'pendingSupervisor',
    icon: Star,
    label: '待评分',
    iconBgClass: 'bg-warning/10 text-warning',
    getValue: (o) =>
      String(o?.readyForSupervisorReview ?? o?.pendingSupervisorCount ?? 0),
  },
  {
    key: 'avgScore',
    icon: TrendingUp,
    label: '团队均分',
    iconBgClass: 'bg-success/10 text-success',
    getValue: (o) => (o?.avgScore != null ? o.avgScore.toFixed(1) : '-'),
  },
];

const TeamPerformancePage: React.FC = () => {
  const navigate = useNavigate();
  const userInfo = useCurrentUserProfile();

  const [overview, setOverview] = useState<TeamOverviewResponse | null>(null);
  const [subordinates, setSubordinates] = useState<SubordinateRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [remindDialogOpen, setRemindDialogOpen] = useState<boolean>(false);
  const [remindTarget, setRemindTarget] = useState<SubordinateRecord | null>(
    null,
  );
  const [remindingIds, setRemindingIds] = useState<Set<string>>(new Set());

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const result = await teamPerformanceApi.getOverview();
      setOverview(result);
    } catch (err: unknown) {
      logger.error(`Failed to load team overview: ${JSON.stringify(err)}`);
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSubordinates = useCallback(async () => {
    setLoadingList(true);
    try {
      const result = await teamPerformanceApi.getSubordinates({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter || undefined,
      });
      setSubordinates(result?.items ?? []);
      setTotal(result.total);
    } catch (err: unknown) {
      logger.error(`Failed to load subordinates: ${JSON.stringify(err)}`);
      handleApiError(err);
      setSubordinates([]);
      setTotal(0);
    } finally {
      setLoadingList(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    if (!userInfo?.user_id) return;
    loadOverview();
  }, [loadOverview, userInfo?.user_id]);
  useEffect(() => {
    if (!userInfo?.user_id) return;
    loadSubordinates();
  }, [loadSubordinates, userInfo?.user_id]);

  const gradeChartData = useMemo(() => {
    const dist = overview?.gradeDistribution;
    if (!dist || Object.keys(dist).length === 0) return [];
    return ['S', 'A', 'B', 'C', 'D']
      .filter((g) => dist[g] != null)
      .map((g) => ({ grade: g, count: dist[g] }));
  }, [overview]);

  const teamColumns: PageTableColumn<SubordinateRecord>[] = useMemo(
    () => [
      { key: 'name', header: '姓名', render: (item) => item.employeeName },
      { key: 'dept', header: '部门', render: (item) => item.department },
      { key: 'position', header: '职位', render: (item) => item.position },
      { key: 'period', header: '绩效周期', render: (item) => item.period },
      {
        key: 'status',
        header: '状态',
        render: (item) => <StatusBadge status={item.status} />,
      },
      {
        key: 'totalScore',
        header: '总分',
        render: (item) => (item.totalScore != null ? item.totalScore : '-'),
      },
      {
        key: 'grade',
        header: '等级',
        render: (item) =>
          item.grade ? <GradeBadge grade={item.grade} /> : '-',
      },
      {
        key: 'actions',
        header: '操作',
        headerClassName: 'sticky right-0 bg-background z-20 border-l',
        className:
          'sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l',
        render: (item) => (
          <div className="flex items-center gap-1">
            {item.status === 'self_review' && (
              <CanRole roles={['admin', 'dept_head', 'supervisor']}>
                <CanDo resource="team_performance" action="edit">
                  <ActionBadge
                    actionType="toggle"
                    icon={<Bell className="size-3" />}
                    label="催办"
                    disabled={remindingIds.has(item.id)}
                    onClick={() => handleRemind(item)}
                  />
                </CanDo>
              </CanRole>
            )}
            <ActionBadge
              actionType="view"
              icon={<Eye className="size-3" />}
              label="查看/评分"
              onClick={() => navigate(`/assessment/${item.id}?view=supervisor`)}
            />
          </div>
        ),
      },
    ],
    [navigate, remindingIds],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 md:gap-6">
      <PageHeader title="团队绩效" visuallyHidden />

      {/* Stats and Chart Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Section Cards - Left Side */}
        <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
          {cardDefs.map((def) => {
            const Icon = def.icon;
            return (
              <Card key={def.key} className="rounded-xl">
                <CardContent className="flex items-center gap-4 p-6">
                  <div
                    className={`flex items-center justify-center size-12 rounded-lg ${def.iconBgClass}`}
                  >
                    <Icon className="size-6" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{def.label}</p>
                    <p className="text-3xl font-bold text-foreground">
                      {def.getValue(overview)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Grade Distribution Chart - Right Side */}
        {gradeChartData.length > 0 && (
          <Card className="rounded-xl h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3Icon className="size-4 text-muted-foreground" />
                等级分布
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ChartContainer
                config={chartConfig}
                className="flex-1 w-full min-h-0"
              >
                <BarChart data={gradeChartData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis
                    dataKey="grade"
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    className="text-xs text-muted-foreground"
                    allowDecimals={false}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {gradeChartData.map((entry, idx) => (
                      <Cell
                        key={entry.grade}
                        fill={
                          gradeChartColors[entry.grade] || 'hsl(var(--chart-1))'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Subordinates Table */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">下属绩效列表</CardTitle>
          <Select
            value={statusFilter || '__all'}
            onValueChange={(val: string) => {
              setPage(1);
              setStatusFilter(val === '__all' ? '' : val);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__all">全部状态</SelectItem>
                <SelectItem value="self_review">待自评</SelectItem>
                <SelectItem value="supervisor_review">待上级评分</SelectItem>
                <SelectItem value="pending_sign">待签名</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <PageTable
            columns={teamColumns}
            data={subordinates}
            loading={loadingList}
            emptyMessage={
              statusFilter
                ? '暂无符合筛选条件的绩效记录'
                : '暂无非您负责的下属团队数据'
            }
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <Dialog open={remindDialogOpen} onOpenChange={setRemindDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>催办提醒</DialogTitle>
            <DialogDescription>
              确认向 {remindTarget?.employeeName ?? ''} 发送催办提醒？绩效周期：
              {remindTarget?.period ?? ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemindDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              disabled={
                remindTarget ? remindingIds.has(remindTarget.id) : false
              }
              onClick={confirmRemind}
            >
              确认发送
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function handleRemind(record: SubordinateRecord) {
    setRemindTarget(record);
    setRemindDialogOpen(true);
  }

  async function confirmRemind() {
    if (!remindTarget) return;
    const targetId = remindTarget.id;
    setRemindingIds((prev) => new Set(prev).add(targetId));
    try {
      await teamPerformanceApi.sendRemind({ instanceIds: [targetId] });
      toast.success(`已向 ${remindTarget.employeeName} 发送催办提醒`);
      setRemindDialogOpen(false);
      setRemindTarget(null);
      loadSubordinates();
    } catch (err: unknown) {
      logger.error(`Failed to send remind: ${JSON.stringify(err)}`);
      handleApiError(err);
    } finally {
      setRemindingIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  }
};

export default TeamPerformancePage;
