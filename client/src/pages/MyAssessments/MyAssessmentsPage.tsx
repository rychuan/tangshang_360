import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  Eye,
  ClipboardList,
  CheckCircle2,
  Award,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  AreaChartIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/business-ui/page-header';
import { StatusBadge, GradeBadge } from '@/components/business-ui/status-badge';
import { PageTable } from '@/components/business-ui/page-table';
import type { PageTableColumn } from '@/components/business-ui/page-table';
import * as myAssessmentApi from '@/api/my-assessment';
import type {
  MyAssessmentRecordItem,
  MyAssessmentSummary,
} from '@shared/api.interface';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'self_review', label: '待自评' },
  { value: 'supervisor_review', label: '待上级评分' },
  { value: 'pending_sign', label: '待签名' },
  { value: 'completed', label: '已完成' },
];

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
  score: { label: '考核均分', color: 'hsl(var(--chart-2))' },
};

const myAssessmentColumns: PageTableColumn<MyAssessmentRecordItem>[] = [
  { key: 'period', header: '考核周期', render: (item) => item.period },
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
    align: 'center',
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
      <div className="flex items-center gap-1">
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
    render: (item) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/assessment/${item.id}`)}
      >
        <Eye className="size-4 mr-2" />
        查看详情
      </Button>
    ),
  },
];

const MyAssessmentsPage: React.FC = () => {
  const userInfo = useCurrentUserProfile();
  const navigate = useNavigate();

  const [records, setRecords] = useState<MyAssessmentRecordItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;
  const [loading, setLoading] = useState<boolean>(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>(
    String(new Date().getFullYear()),
  );

  const [trendItems, setTrendItems] = useState<
    Array<{ period: string; avgScore: number | null }>
  >([]);
  const [trendLoading, setTrendLoading] = useState<boolean>(true);
  const [trendError, setTrendError] = useState<string | null>(null);

  const [summary, setSummary] = useState<MyAssessmentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setRecordsError(null);
    try {
      const result = await myAssessmentApi.getRecords({
        page,
        pageSize,
        status: statusFilter || undefined,
        periodStart: `${yearFilter}-01`,
        periodEnd: `${yearFilter}-12`,
      });
      setRecords(result?.items ?? []);
      setTotal(result.total);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载考核记录失败';
      logger.error(`Failed to fetch my assessment records: ${msg}`);
      setRecords([]);
      setTotal(0);
      setRecordsError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, yearFilter]);

  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const result = await myAssessmentApi.getTrend(yearFilter);
      setTrendItems(result?.items ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载趋势数据失败';
      logger.error(`Failed to fetch my assessment trend: ${msg}`);
      setTrendItems([]);
      setTrendError(msg);
    } finally {
      setTrendLoading(false);
    }
  }, [yearFilter]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const result = await myAssessmentApi.getSummary(yearFilter);
      setSummary(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '加载汇总数据失败';
      logger.error(`Failed to fetch my assessment summary: ${msg}`);
      setSummary(null);
      setSummaryError(msg);
    } finally {
      setSummaryLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => {
    if (!userInfo?.user_id) return;
    fetchRecords();
  }, [fetchRecords, userInfo?.user_id]);
  useEffect(() => {
    if (!userInfo?.user_id) return;
    fetchTrend();
  }, [fetchTrend, userInfo?.user_id]);
  useEffect(() => {
    if (!userInfo?.user_id) return;
    fetchSummary();
  }, [fetchSummary, userInfo?.user_id]);

  const handlePrevYear = () => {
    setYearFilter(String(parseInt(yearFilter, 10) - 1));
    setPage(1);
  };
  const handleNextYear = () => {
    setYearFilter(String(parseInt(yearFilter, 10) + 1));
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);

  if (!userInfo?.user_id) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        正在加载用户信息...
      </div>
    );
  }

  const summaryCards = [
    {
      title: '考核总数',
      value: summary ? String(summary.totalCount) : '-',
      icon: ClipboardList,
    },
    {
      title: '已完成',
      value: summary ? String(summary.completedCount) : '-',
      icon: CheckCircle2,
    },
    {
      title: '平均得分',
      value: summary?.avgScore != null ? summary.avgScore.toFixed(1) : '-',
      icon: BarChart3,
    },
    { title: '最新等级', value: summary?.latestGrade ?? '-', icon: Award },
  ];

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 md:gap-6">
      <PageHeader
        title="我的考核"
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={handlePrevYear}>
              <ChevronLeft className="size-4" />
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
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-1"
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

      {/* Section Cards */}
      <div className="grid auto-rows-min gap-4 md:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="rounded-xl">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-6" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {card.title}
                  </div>
                  <div className="text-3xl font-bold text-foreground">
                    {summaryLoading ? '...' : card.value}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {summaryError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          汇总数据加载失败：{summaryError}
        </div>
      )}

      {/* Trend Chart */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AreaChartIcon className="size-4 text-muted-foreground" />
            考核趋势
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              加载中...
            </div>
          ) : trendError ? (
            <div className="flex items-center justify-center h-[300px] text-sm text-destructive">
              趋势数据加载失败：{trendError}
            </div>
          ) : trendItems.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              暂无趋势数据
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

      {/* Filter */}
      <Card className="rounded-xl">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <span className="text-sm text-muted-foreground">筛选：</span>
          <NativeSelect
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <NativeSelectOption key={opt.value} value={opt.value}>
                {opt.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">我的考核记录</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recordsError ? (
            <div className="flex items-center justify-center py-8 text-sm text-destructive">
              考核记录加载失败：{recordsError}
            </div>
          ) : (
            <PageTable
              columns={myAssessmentColumns}
              data={records}
              loading={loading}
              emptyMessage="暂无考核记录"
              page={page}
              totalPages={totalPages}
              total={total}
              onPageChange={setPage}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyAssessmentsPage;
