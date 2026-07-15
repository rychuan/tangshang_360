import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/api/queryKeys';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
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
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Eye, ChevronLeft, ChevronRight, AreaChartIcon } from 'lucide-react';
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
  score: { label: '绩效均分', color: 'hsl(var(--chart-2))' },
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
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));

  const recordsQuery = useQuery({
    queryKey: queryKeys.myAssessments.records({
      page, pageSize,
      periodStart: `${yearFilter}-01`,
      periodEnd: `${yearFilter}-12`,
    }),
    queryFn: () => myAssessmentApi.getRecords({
      page, pageSize,
      periodStart: `${yearFilter}-01`,
      periodEnd: `${yearFilter}-12`,
    }),
  });

  const trendQuery = useQuery({
    queryKey: queryKeys.myAssessments.trend(yearFilter),
    queryFn: () => myAssessmentApi.getTrend(yearFilter),
  });

  const records = recordsQuery.data?.items ?? [];
  const total = recordsQuery.data?.total ?? 0;
  const loading = recordsQuery.isLoading;
  const recordsError = recordsQuery.error ? '加载绩效记录失败' : null;
  const trendItems = trendQuery.data?.items ?? [];
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
            <Button variant="outline" size="icon" onClick={handlePrevYear}>
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
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AreaChartIcon className="size-4 text-muted-foreground" />
            绩效趋势
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <div className="flex items-center justify-center h-[300px]">
              <Spinner className="size-6" />
            </div>
          ) : trendError ? (
            <div className="flex items-center justify-center h-[300px] text-sm text-destructive">
              趋势数据加载失败：{trendError}
            </div>
          ) : trendItems.length === 0 ? (
            <div className="flex items-center justify-center h-[300px]">
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
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart
                data={trendItems.map((t) => ({ ...t, score: t.avgScore }))}
              >
                <defs>
                  <linearGradient
                    id="fillMyAssessment"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
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
                  dataKey="period"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs text-muted-foreground"
                  angle={-45}
                  textAnchor="end"
                  height={60}
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
                  fill="url(#fillMyAssessment)"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  connectNulls
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

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
                  data={records}
                  loading={loading}
                  emptyMessage="暂无绩效记录"
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  onPageChange={setPage}
                />
              </div>
              <div className="md:hidden">
                {records.length === 0 ? (
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
                    {records.map((item) => (
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
                            <p className="text-xs text-muted-foreground">总分</p>
                            <p className="font-semibold">
                              {item.totalScore != null ? item.totalScore : '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">等级</p>
                            {item.grade ? <GradeBadge grade={item.grade} /> : '-'}
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
                              ? new Date(item.completedAt).toLocaleString('zh-CN')
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
