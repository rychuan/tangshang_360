import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { CanDo } from '@/hooks/usePermissions';
import { handleApiError } from '@/utils/api-error';
import { PageHeader } from '@/components/business-ui/page-header';
import { StatusBadge, GradeBadge } from '@/components/business-ui/status-badge';
import { UserDisplay } from '@/components/business-ui/user-display';
import { PageTable } from '@/components/business-ui/page-table';
import type { PageTableColumn } from '@/components/business-ui/page-table';
import * as teamPerformanceApi from '@/api/team-performance';
import type {
  TeamOverviewResponse,
  SubordinateRecord,
} from '@shared/api.interface';
import { COMMAND_PERMISSIONS } from '@/components/permission-policy';

const PAGE_SIZE = 10;

const GRADE_COLORS = ['S', 'A', 'B', 'C', 'D'];

const RANKING_BAR_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#7c3aed',
  '#0891b2',
];

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
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPeriods, setSelectedPeriods] = useState([currentMonth()]);
  const activePeriods = selectedPeriods;
  const [remindDialogOpen, setRemindDialogOpen] = useState(false);
  const [remindTarget, setRemindTarget] = useState<SubordinateRecord | null>(
    null,
  );
  const [remindingIds, setRemindingIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const pageSize = PAGE_SIZE;

  const { data: overview = null, isLoading: loading } = useQuery({
    queryKey: ['team-performance', 'overview', activePeriods],
    queryFn: () =>
      teamPerformanceApi.getOverview(
        activePeriods.length > 0 ? activePeriods : undefined,
      ),
  });

  const { data: subordinates = [], isLoading: loadingList } = useQuery({
    queryKey: [
      'team-performance',
      'subordinates',
      { page, statusFilter, activePeriods },
    ],
    queryFn: () =>
      teamPerformanceApi
        .getSubordinates({
          page,
          pageSize: PAGE_SIZE,
          status: statusFilter || undefined,
          periods: activePeriods.length > 0 ? activePeriods : undefined,
        })
        .then((res) => {
          setTotal(res.total);
          return res?.items ?? [];
        }),
  });

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

  const scoreRankingData = useMemo(() => {
    return subordinates
      .filter((s) => s.totalScore != null)
      .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
      .slice(0, 20)
      .map((s, i) => ({
        employeeId: s.employeeId,
        name: s.employeeName,
        score: s.totalScore ?? 0,
        fill: RANKING_BAR_COLORS[i % RANKING_BAR_COLORS.length],
      }));
  }, [subordinates]);

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
              <CanDo resource="team_performance" action="edit">
                <ActionBadge
                  actionType="toggle"
                  icon={<Bell className="size-3" />}
                  label="催办"
                  disabled={remindingIds.has(item.id)}
                  onClick={() => handleRemind(item)}
                />
              </CanDo>
            )}
            <CanDo {...COMMAND_PERMISSIONS.assessmentView}>
              <ActionBadge
                actionType="view"
                icon={<Eye className="size-3" />}
                label="查看/评分"
                onClick={() =>
                  navigate(`../assessment/${item.id}?view=supervisor`)
                }
              />
            </CanDo>
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
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader title="团队绩效" visuallyHidden />
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground shrink-0">
            考核周期
          </span>
          <MultiMonthPicker
            value={selectedPeriods}
            onChange={(value: string[]) => {
              setSelectedPeriods(value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* Stats row — 3 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left — 3 stacked stat cards */}
        <div className="flex flex-col gap-4">
          {/* 团队人数 */}
          <Card className="rounded-xl">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary shrink-0">
                <Users className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">团队人数</p>
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

        {/* Middle — Score ranking bars */}
        <Card className="rounded-xl flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">分数排名</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 px-3 pb-3">
            {scoreRankingData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <TrendingUp className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无数据</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {scoreRankingData.map((entry) => {
                  const maxScore = scoreRankingData[0]?.score || 100;
                  const pct = Math.max((entry.score / maxScore) * 100, 4);
                  return (
                    <div
                      key={entry.employeeId}
                      className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="h-6 min-w-0 flex-1 rounded-sm bg-muted">
                          <div
                            className="flex h-full min-w-[32px] items-center justify-end rounded-sm pr-1.5"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: entry.fill,
                            }}
                          >
                            <span className="text-xs font-mono font-bold text-white">
                              {entry.score}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <UserDisplay
                          value={{
                            user_id: entry.employeeId,
                            name: entry.name,
                          }}
                          size="small"
                          showLabel
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — 等级分布 Pie Chart */}
        <Card className="rounded-xl flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">等级分布</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center p-2">
            {gradeChartData.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TrendingUp className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>暂无数据</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <ChartContainer
                config={chartConfig}
                className="mx-auto aspect-square w-full max-h-[180px] [&_.recharts-pie-label-text]:fill-foreground"
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
                    outerRadius="85%"
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
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__all">全部状态</SelectItem>
                <SelectItem value="self_review">待自评</SelectItem>
                <SelectItem value="pending_sign">员工步骤中</SelectItem>
                <SelectItem value="supervisor_review">待上级评分</SelectItem>
                <SelectItem value="supervisor_sign">上级步骤中</SelectItem>
                <SelectItem value="completed">已完成</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
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
          </div>
          <div className="md:hidden">
            {loadingList ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="size-6" />
              </div>
            ) : subordinates.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Users className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>
                      {statusFilter
                        ? '暂无符合筛选条件的绩效记录'
                        : '暂无非您负责的下属团队数据'}
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {subordinates.map((item) => (
                  <div key={item.id} className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <UserDisplay
                          value={{
                            user_id: item.employeeId,
                            name: item.employeeName,
                          }}
                          size="small"
                          showLabel
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.department || '-'} · {item.position || '-'}
                        </p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">周期</p>
                        <p className="font-medium">{item.period}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">总分</p>
                        <p className="font-semibold">
                          {item.totalScore != null ? item.totalScore : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">等级</p>
                        {item.grade ? <GradeBadge grade={item.grade} /> : '-'}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {item.status === 'self_review' && (
                        <CanDo resource="team_performance" action="edit">
                          <ActionBadge
                            actionType="toggle"
                            icon={<Bell className="size-3" />}
                            label="催办"
                            disabled={remindingIds.has(item.id)}
                            onClick={() => handleRemind(item)}
                          />
                        </CanDo>
                      )}
                      <CanDo {...COMMAND_PERMISSIONS.assessmentView}>
                        <ActionBadge
                          actionType="view"
                          icon={<Eye className="size-3" />}
                          label="查看/评分"
                          onClick={() =>
                            navigate(`../assessment/${item.id}?view=supervisor`)
                          }
                        />
                      </CanDo>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t px-4 py-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(Math.max(1, page - 1))}
                >
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                >
                  下一页
                </Button>
              </div>
            )}
          </div>
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
      queryClient.invalidateQueries({ queryKey: ['team-performance'] });
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
