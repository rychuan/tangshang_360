import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts';
import {
  Eye,
  ChevronLeft,
  ChevronRight,
  AreaChartIcon,
} from '@/components/ui/hugeicons';
import { PageHeader } from '@/components/business-ui/page-header';
import { StatusBadge, GradeBadge } from '@/components/business-ui/status-badge';
import { PageTable } from '@/components/business-ui/page-table';
import type { PageTableColumn } from '@/components/business-ui/page-table';
import * as myAssessmentApi from '@/api/my-assessment';
import type { MyAssessmentRecordItem } from '@shared/api.interface';

function signBadge(label: string, signedAt?: string) {
  return signedAt ? (
    <Badge className="border-transparent bg-success text-success-foreground text-xs">
      {label}已签
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-xs">
      {label}未签
    </Badge>
  );
}

const chartConfig = {
  score: { label: '绩效均分', color: 'var(--chart-2)' },
};

const MyAssessmentsPage: React.FC = () => {
  const navigate = useNavigate();

  const myAssessmentColumns: PageTableColumn<MyAssessmentRecordItem>[] = [
    { key: 'period', header: '绩效周期', render: (item) => item.period },
    { key: 'position', header: '岗位', render: (item) => item.position },
    {
      key: 'totalScore',
      header: '总分',
      align: 'right',
      render: (item) => (item.totalScore != null ? item.totalScore : '-'),
    },
    {
      key: 'grade',
      header: '等级',
      render: (item) => (item.grade ? <GradeBadge grade={item.grade} /> : '-'),
    },
    {
      key: 'status',
      header: '状态',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: 'signStatus',
      header: '签名状态',
      render: (item) => (
        <div className="flex flex-wrap items-center gap-1">
          {signBadge('自评', item.selfSignAt)}
          {signBadge('上级', item.supervisorSignAt)}
        </div>
      ),
    },
    {
      key: 'completedAt',
      header: '完成时间',
      render: (item) =>
        item.completedAt
          ? new Date(item.completedAt).toLocaleString('zh-CN')
          : '-',
    },
    {
      key: 'actions',
      header: '操作',
      headerClassName: 'sticky right-0 bg-background z-20 border-l',
      className:
        'sticky right-0 bg-background group-hover:bg-muted/50 z-10 border-l',
      render: (item) => (
        <ActionBadge
          actionType="view"
          icon={<Eye className="size-3" />}
          label="查看详情"
          onClick={() => navigate(`/assessment/${item.id}`)}
        />
      ),
    },
  ];

  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [yearFilter, setYearFilter] = useState(
    String(new Date().getFullYear()),
  );

  const recordsQuery = useQuery({
    queryKey: queryKeys.myAssessments.records({
      page,
      pageSize,
      periodStart: `${yearFilter}-01`,
      periodEnd: `${yearFilter}-12`,
    }),
    queryFn: () =>
      myAssessmentApi.getRecords({
        page,
        pageSize,
        periodStart: `${yearFilter}-01`,
        periodEnd: `${yearFilter}-12`,
      }),
  });

  const trendQuery = useQuery({
    queryKey: queryKeys.myAssessments.trend(yearFilter),
    queryFn: () => myAssessmentApi.getTrend(yearFilter),
  });

  const records = recordsQuery.data?.items ?? [];
  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.period.localeCompare(a.period)),
    [records],
  );
  const total = recordsQuery.data?.total ?? 0;
  const loading = recordsQuery.isLoading;
  const recordsError = recordsQuery.error ? '加载绩效记录失败' : null;
  const trendItems = trendQuery.data?.items ?? [];
  const summaryQuery = useQuery({
    queryKey: queryKeys.myAssessments.summary(yearFilter),
    queryFn: () => myAssessmentApi.getSummary(yearFilter),
  });
  const summary = summaryQuery.data;
  const summaryLoading = summaryQuery.isLoading;
  const trendLoading = trendQuery.isLoading;
  const trendError = trendQuery.error ? '加载趋势数据失败' : null;

  const handlePrevYear = () => {
    setYearFilter(String(parseInt(yearFilter, 10) - 1));
    setPage(1);
  };
  const handleNextYear = () => {
    setYearFilter(String(parseInt(yearFilter, 10) + 1));
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 md:gap-6">
      <PageHeader
        title="我的绩效"
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevYear}
              aria-label="上一年"
            >
              <ChevronLeft />
            </Button>
            <span className="text-base font-semibold min-w-[72px] text-center text-foreground">
              {yearFilter}年
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextYear}
              disabled={parseInt(yearFilter, 10) >= new Date().getFullYear()}
              aria-label="下一年"
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-1 hidden sm:inline-flex"
              onClick={() => {
                setYearFilter(String(new Date().getFullYear()));
                setPage(1);
              }}
            >
              今年
            </Button>
          </div>
        }
      />

      {/* Trend Chart */}
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        {/* Left: Summary card */}
        <Card className="rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{yearFilter}年考核概览</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {summaryLoading ? (
              <div className="flex items-center justify-center h-40">
                <Spinner className="size-5" />
              </div>
            ) : !summary ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold">{summary.totalCount}</p>
                    <p className="text-xs text-muted-foreground">考核总数</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold">
                      {summary.completedCount}
                    </p>
                    <p className="text-xs text-muted-foreground">已完成</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold">{summary.avgScore}</p>
                    <p className="text-xs text-muted-foreground">平均分</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-2xl font-bold">{summary.pendingCount}</p>
                    <p className="text-xs text-muted-foreground">待完成</p>
                  </div>
                </div>
                {summary.completedCount > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">完成进度</span>
                      <span className="font-medium">
                        {Math.round(
                          (summary.completedCount / summary.totalCount) * 100,
                        )}
                        %
                      </span>
                    </div>
                    <Progress
                      value={Math.round(
                        (summary.completedCount / summary.totalCount) * 100,
                      )}
                      className="h-2"
                    />
                  </div>
                )}
                {summary.latestGrade && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">最新等级</span>
                    <GradeBadge grade={summary.latestGrade} />
                  </div>
                )}
                {sortedRecords.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      navigate(`/assessment/${sortedRecords[0].id}`)
                    }
                  >
                    <Eye className="size-3.5 mr-1" />
                    查看最新考核详情
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: Trend Chart */}
        <Card className="rounded-xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AreaChartIcon className="size-4 text-muted-foreground" />
              绩效趋势
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="flex items-center justify-center h-[220px]">
                <Spinner className="size-6" />
              </div>
            ) : trendError ? (
              <div className="flex items-center justify-center h-[220px] text-sm text-destructive">
                趋势数据加载失败：{trendError}
              </div>
            ) : trendItems.length === 0 ? (
              <div className="flex items-center justify-center h-[220px]">
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <AreaChartIcon className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>暂无趋势数据</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : (
              <ChartContainer config={chartConfig} className="h-[220px] w-full">
                <AreaChart
                  accessibilityLayer
                  data={trendItems.map((t) => ({ ...t, score: t.avgScore }))}
                  margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillScore" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-score)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-score)"
                        stopOpacity={0.04}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    tickFormatter={(value: string) => {
                      const parts = value.split('-');
                      return parts[1] ?? value;
                    }}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={30}
                    className="text-xs text-muted-foreground"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    className="text-xs text-muted-foreground"
                    domain={[0, 100]}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="line" />}
                  />
                  <Area
                    dataKey="score"
                    type="monotone"
                    fill="url(#fillScore)"
                    stroke="var(--color-score)"
                    strokeWidth={2}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Records Table */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">我的绩效记录</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recordsError ? (
            <div className="flex items-center justify-center py-8 text-sm text-destructive">
              绩效记录加载失败：{recordsError}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <PageTable
                  columns={myAssessmentColumns}
                  data={sortedRecords}
                  loading={loading}
                  rowKey={(item) => item.id}
                  emptyMessage="暂无绩效记录"
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  onPageChange={setPage}
                />
              </div>
              <div className="md:hidden">
                {sortedRecords.length === 0 ? (
                  <div className="flex items-center justify-center py-12">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <AreaChartIcon className="size-6" />
                        </EmptyMedia>
                        <EmptyTitle>暂无绩效记录</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  </div>
                ) : (
                  <div className="flex flex-col divide-y">
                    {sortedRecords.map((item) => (
                      <div key={item.id} className="flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {item.period}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {item.position || '-'}
                            </p>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              总分
                            </p>
                            <p className="font-semibold">
                              {item.totalScore != null ? item.totalScore : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              等级
                            </p>
                            {item.grade ? (
                              <GradeBadge grade={item.grade} />
                            ) : (
                              '-'
                            )}
                          </div>
                          <div className="col-span-2">
                            <p className="mb-1 text-xs text-muted-foreground">
                              签名状态
                            </p>
                            <div className="flex flex-wrap items-center gap-1">
                              {signBadge('自评', item.selfSignAt)}
                              {signBadge('上级', item.supervisorSignAt)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            {item.completedAt
                              ? new Date(item.completedAt).toLocaleString(
                                  'zh-CN',
                                )
                              : '未完成'}
                          </p>
                          <ActionBadge
                            actionType="view"
                            icon={<Eye className="size-3" />}
                            label="查看详情"
                            onClick={() => navigate(`/assessment/${item.id}`)}
                          />
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyAssessmentsPage;
