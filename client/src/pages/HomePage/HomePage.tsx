import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardCheckIcon,
  UsersIcon,
  PenToolIcon,
  TrendingUpIcon,
  CheckCircleIcon,
  ClockIcon,
  AreaChartIcon,
  BarChart3Icon,
} from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@client/src/utils/api-error';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  LineChart,
} from 'recharts';
import { PageHeader } from '@/components/business-ui/page-header';
import { getTodos, getOverview } from '@/api/dashboard';
import type {
  DashboardTodosResponse,
  DashboardOverviewResponse,
} from '@shared/api.interface';

const TODO_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  self_review: ClipboardCheckIcon,
  self_sign: PenToolIcon,
  supervisor_review: UsersIcon,
  supervisor_sign: PenToolIcon,
};

const TODO_LABELS: Record<string, string> = {
  self_review: '自评',
  self_sign: '员工签名',
  supervisor_review: '上级评分',
  supervisor_sign: '上级签名',
};

const TODO_COLORS: Record<string, string> = {
  self_review: 'text-info bg-info/10',
  self_sign: 'text-success bg-success/10',
  supervisor_review: 'text-warning bg-warning/10',
  supervisor_sign: 'text-primary bg-primary/10',
};

const HomePage: React.FC = () => {
  const [todos, setTodos] = useState<DashboardTodosResponse['items']>([]);
  const [overview, setOverview] = useState<DashboardOverviewResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todosRes, overviewRes] = await Promise.all([
        getTodos(),
        getOverview(),
      ]);
      setTodos(todosRes?.items ?? []);
      setOverview(overviewRes ?? null);
    } catch (e: unknown) {
      logger.error('Dashboard load error:', e);
      handleApiError(e);
      setError('加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-muted-foreground gap-4">
        <p className="text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={loadDashboard}>
          重试
        </Button>
      </div>
    );
  }

  const gradeData = overview?.stats?.gradeDistribution
    ? Object.entries(overview.stats.gradeDistribution)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([grade, count]) => ({ grade, count }))
    : [];

  const trendData = overview?.stats?.trend || [];

  const chartConfig = {
    count: { label: '人数', color: 'hsl(var(--chart-1))' },
    score: { label: '平均分', color: 'hsl(var(--chart-2))' },
  };

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 md:gap-6">
      <PageHeader title="绩效概览" visuallyHidden />

      {/* Section Cards — dashboard-01 style */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-center size-12 rounded-lg bg-warning/10 text-warning">
              <ClockIcon className="size-6" />
            </div>
            <p className="mt-4 text-3xl font-bold tabular-nums">
              {overview?.stats?.pendingCount ?? 0}
            </p>
            <p className="mt-1 text-sm font-medium">待处理</p>
            <p className="mt-1 text-xs text-muted-foreground">
              当前待处理的考核任务
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-center size-12 rounded-lg bg-success/10 text-success">
              <CheckCircleIcon className="size-6" />
            </div>
            <p className="mt-4 text-3xl font-bold tabular-nums">
              {overview?.stats?.completedCount ?? 0}
            </p>
            <p className="mt-1 text-sm font-medium">已完成</p>
            <p className="mt-1 text-xs text-muted-foreground">
              已完成的考核数量
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-xl">
          <CardContent className="p-6">
            <div className="flex items-center justify-center size-12 rounded-lg bg-primary/10 text-primary">
              <TrendingUpIcon className="size-6" />
            </div>
            <p className="mt-4 text-3xl font-bold tabular-nums">
              {overview?.stats?.avgScore ?? '-'}
            </p>
            <p className="mt-1 text-sm font-medium">平均分</p>
            <p className="mt-1 text-xs text-muted-foreground">
              所有考核的平均得分
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart Area - Interactive */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AreaChartIcon className="size-4 text-muted-foreground" />
            绩效趋势
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <AreaChart
              data={
                trendData.length > 0
                  ? trendData
                  : [{ month: '暂无数据', score: 0 }]
              }
            >
              <defs>
                <linearGradient id="fillScore" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="hsl(var(--chart-2))"
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor="hsl(var(--chart-2))"
                    stopOpacity={0.05}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                className="text-xs text-muted-foreground"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                className="text-xs text-muted-foreground"
                domain={[0, 100]}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="score"
                fill="url(#fillScore)"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Two column layout: Grade distribution + Todos */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Grade Distribution - Bar Chart */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3Icon className="size-4 text-muted-foreground" />
              等级分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            {gradeData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px]">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <BarChart3Icon className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无数据</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[250px] w-full">
                <BarChart data={gradeData}>
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
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--chart-1))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Todos Section */}
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClockIcon className="size-4 text-muted-foreground" />
              待办任务
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(todos ?? []).length === 0 ? (
              <div className="flex items-center justify-center h-[250px]">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <CheckCircleIcon className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无待办任务</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {todos.map((todo) => {
                  const Icon = TODO_ICONS[todo.type] || ClockIcon;
                  const colorClass = TODO_COLORS[todo.type] || '';
                  return (
                    <Link
                      key={todo.id}
                      to={`/assessment/${todo.id}`}
                      className="block"
                    >
                      <Card className="hover:bg-accent/50 transition-colors cursor-pointer rounded-lg">
                        <CardContent className="flex items-center gap-3 p-3">
                          <div
                            className={`flex items-center justify-center size-9 rounded-md ${colorClass}`}
                          >
                            <Icon className="size-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {todo.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {todo.period}
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0">
                            {TODO_LABELS[todo.type] || todo.type}
                          </Badge>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shortcuts */}
      {overview?.shortcuts?.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {overview.shortcuts.map((s) => (
            <Link key={s.path} to={s.path} className="block">
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer rounded-xl h-full">
                <CardContent className="flex items-center p-4">
                  <span className="text-sm font-medium">{s.title}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default HomePage;
