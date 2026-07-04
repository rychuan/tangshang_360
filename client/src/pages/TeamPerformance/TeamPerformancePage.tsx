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
import { Pie, PieChart } from 'recharts';
import MultiMonthPicker from '@/components/ui/multi-month-picker';
import { Users, TrendingUp, AlertCircle, Bell, Eye } from 'lucide-react';
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

const GRADE_COLORS = ['S', 'A', 'B', 'C', 'D'];

const chartConfig = {
  S: { label: 'S', color: 'hsl(var(--chart-5))' },
  A: { label: 'A', color: 'hsl(var(--chart-1))' },
  B: { label: 'B', color: 'hsl(var(--chart-3))' },
  C: { label: 'C', color: 'hsl(var(--chart-4))' },
  D: { label: 'D', color: 'hsl(var(--chart-2))' },
};

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([
    currentMonth(),
  ]);
  const [remindDialogOpen, setRemindDialogOpen] = useState<boolean>(false);
  const [remindTarget, setRemindTarget] = useState<SubordinateRecord | null>(
    null,
  );
  const [remindingIds, setRemindingIds] = useState<Set<string>>(new Set());

  const activePeriod = selectedPeriods.length > 0 ? selectedPeriods[0] : '';

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const result = await teamPerformanceApi.getOverview(
        activePeriod || undefined,
      );
      setOverview(result);
    } catch (err: unknown) {
      logger.error(`Failed to load team overview: ${JSON.stringify(err)}`);
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [activePeriod]);

  const loadSubordinates = useCallback(async () => {
    setLoadingList(true);
    try {
      const result = await teamPerformanceApi.getSubordinates({
        page,
        pageSize: PAGE_SIZE,
        status: statusFilter || undefined,
        period: activePeriod || undefined,
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
  }, [page, statusFilter, activePeriod]);

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
    return GRADE_COLORS.filter((g) => dist[g] != null).map((g) => ({
      grade: g,
      count: dist[g],
      fill: chartConfig[g]?.color || 'hsl(var(--chart-1))',
    }));
  }, [overview]);

  const incompleteCount = useMemo(() => {
    if (!overview) return 0;
    return overview.totalInstanceCount - overview.completedCount;
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
              onClick={() =>
                navigate(`../assessment/${item.id}?view=supervisor`)
              }
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
      {/* Header + Period Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <PageHeader title="团队绩效" visuallyHidden />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">考核周期</span>
          <MultiMonthPicker
            value={selectedPeriods}
            onChange={(value: string[]) => {
              setSelectedPeriods(value.length > 0 ? [value[0]] : []);
              setPage(1);
            }}
            className="w-40"
          />
        </div>
      </div>

      {/* Stats row — left cards + right pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left — 3 stat cards stacked */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            {/* 下属人数 */}
            <Card className="rounded-xl">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Users className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">下属人数</p>
                  <p className="text-2xl font-bold">
                    {overview?.totalSubordinates ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* 团队均分 */}
            <Card className="rounded-xl">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex items-center justify-center size-10 rounded-lg bg-success/10 text-success shrink-0">
                  <TrendingUp className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">团队均分</p>
                  <p className="text-2xl font-bold">
                    {overview?.avgScore != null
                      ? overview.avgScore.toFixed(1)
                      : '-'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 未完成 */}
          <Card className="rounded-xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex items-center justify-center size-10 rounded-lg bg-warning/10 text-warning shrink-0">
                <AlertCircle className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">未完成</p>
                <p className="text-2xl font-bold">{incompleteCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right — 等级分布 Pie Chart */}
        <Card className="rounded-xl flex flex-col">
          <CardContent className="p-4 flex-1 flex flex-col items-center justify-center">
            {gradeChartData.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无数据</p>
            ) : (
              <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square w-full max-h-[150px] [&_.recharts-pie-label-text]:fill-foreground"
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Pie
                    data={gradeChartData}
                    dataKey="count"
                    nameKey="grade"
                    label={({ grade, count }) => `${grade} (${count})`}
                    cx="50%"
                    cy="50%"
                    outerRadius="90%"
                  />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Team Performance List */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">团队绩效列表</CardTitle>
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
