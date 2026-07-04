import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { handleApiError } from '@client/src/utils/api-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

  const [records, setRecords] = useState<MyAssessmentRecordItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;
  const [loading, setLoading] = useState<boolean>(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  const [yearFilter, setYearFilter] = useState<string>(
    String(new Date().getFullYear()),
  );

  const [trendItems, setTrendItems] = useState<
    Array<{ period: string; avgScore: number | null }>
  >([]);
  const [trendLoading, setTrendLoading] = useState<boolean>(true);
  const [trendError, setTrendError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setRecordsError(null);
    try {
      const result = await myAssessmentApi.getRecords({
        page,
        pageSize,
        periodStart: `${yearFilter}-01`,
        periodEnd: `${yearFilter}-12`,
      });
      setRecords(result?.items ?? []);
      setTotal(result.total);
    } catch (err: unknown) {
      logger.error('Failed to fetch my assessment records:', err);
      handleApiError(err);
      setRecords([]);
      setTotal(0);
      setRecordsError('加载绩效记录失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, yearFilter]);

  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const result = await myAssessmentApi.getTrend(yearFilter);
      setTrendItems(result?.items ?? []);
    } catch (err: unknown) {
      logger.error('Failed to fetch my assessment trend:', err);
      handleApiError(err);
      setTrendItems([]);
      setTrendError('加载趋势数据失败');
    } finally {
      setTrendLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);
  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

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
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        正在加载...
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyAssessmentsPage;
