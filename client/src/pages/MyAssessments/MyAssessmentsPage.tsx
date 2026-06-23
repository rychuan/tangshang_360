import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Eye, TrendingUp, ClipboardList, CheckCircle2, Award, BarChart3, ChevronLeft, ChevronRight, AreaChartIcon } from 'lucide-react';
import * as myAssessmentApi from '@/api/my-assessment';
import type { MyAssessmentRecordItem, MyAssessmentSummary } from '@shared/api.interface';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'self_review', label: '待自评' },
  { value: 'supervisor_review', label: '待上级评分' },
  { value: 'pending_sign', label: '待签名' },
  { value: 'completed', label: '已完成' },
];

const statusMap: Record<string, { label: string; className: string }> = {
  self_review: { label: '待自评', className: 'border-transparent bg-warning text-warning-foreground' },
  supervisor_review: { label: '待上级评分', className: 'border-transparent bg-warning text-warning-foreground' },
  pending_sign: { label: '待签名', className: 'border-transparent bg-info text-info-foreground' },
  completed: { label: '已完成', className: 'border-transparent bg-success text-success-foreground' },
};

function statusBadge(status: string) {
  const cfg = statusMap[status];
  if (!cfg) return <Badge variant="secondary">{status}</Badge>;
  return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

function signBadge(label: string, signedAt?: string) {
  return signedAt
    ? <Badge className="border-transparent bg-success text-success-foreground text-xs">{label}已签</Badge>
    : <Badge variant="secondary" className="text-xs">{label}未签</Badge>;
}

const chartConfig = {
  score: { label: '考核均分', color: 'hsl(var(--chart-2))' },
};

const MyAssessmentsPage: React.FC = () => {
  const userInfo = useCurrentUserProfile();
  const navigate = useNavigate();

  const [records, setRecords] = useState<MyAssessmentRecordItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(true);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>(String(new Date().getFullYear()));

  const [trendItems, setTrendItems] = useState<Array<{ period: string; avgScore: number | null }>>([]);
  const [trendLoading, setTrendLoading] = useState<boolean>(true);

  const [summary, setSummary] = useState<MyAssessmentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const result = await myAssessmentApi.getRecords({ page, pageSize, status: statusFilter || undefined, periodStart: `${yearFilter}-01`, periodEnd: `${yearFilter}-12` });
      setRecords(result?.items ?? []);
      setTotal(result.total);
    } catch (err: unknown) {
      logger.error(`Failed to fetch my assessment records: ${JSON.stringify(err)}`);
      setRecords([]); setTotal(0);
    } finally { setLoading(false); }
  }, [page, pageSize, statusFilter, yearFilter]);

  const fetchTrend = useCallback(async () => {
    setTrendLoading(true);
    try {
      const result = await myAssessmentApi.getTrend(yearFilter);
      setTrendItems(result?.items ?? []);
    } catch (err: unknown) {
      logger.error(`Failed to fetch my assessment trend: ${JSON.stringify(err)}`); setTrendItems([]);
    } finally { setTrendLoading(false); }
  }, [yearFilter]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const result = await myAssessmentApi.getSummary(yearFilter);
      setSummary(result);
    } catch (err: unknown) {
      logger.error(`Failed to fetch my assessment summary: ${JSON.stringify(err)}`); setSummary(null);
    } finally { setSummaryLoading(false); }
  }, [yearFilter]);

  useEffect(() => { if (!userInfo?.user_id) return; fetchRecords(); }, [fetchRecords, userInfo?.user_id]);
  useEffect(() => { if (!userInfo?.user_id) return; fetchTrend(); }, [fetchTrend, userInfo?.user_id]);
  useEffect(() => { if (!userInfo?.user_id) return; fetchSummary(); }, [fetchSummary, userInfo?.user_id]);

  const handlePrevYear = () => { setYearFilter(String(parseInt(yearFilter, 10) - 1)); setPage(1); };
  const handleNextYear = () => { setYearFilter(String(parseInt(yearFilter, 10) + 1)); setPage(1); };

  const totalPages = Math.ceil(total / pageSize);

  if (!userInfo?.user_id) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">正在加载用户信息...</div>;
  }

  const summaryCards = [
    { title: '考核总数', value: summary ? String(summary.totalCount) : '-', icon: ClipboardList },
    { title: '已完成', value: summary ? String(summary.completedCount) : '-', icon: CheckCircle2 },
    { title: '平均得分', value: summary ? summary.avgScore.toFixed(1) : '-', icon: BarChart3 },
    { title: '最新等级', value: summary?.latestGrade ?? '-', icon: Award },
  ];

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">我的考核</h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={handlePrevYear}><ChevronLeft className="size-4" /></Button>
          <span className="text-base font-semibold min-w-[72px] text-center text-foreground">{yearFilter}年</span>
          <Button variant="outline" size="icon" onClick={handleNextYear} disabled={parseInt(yearFilter, 10) >= new Date().getFullYear()}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="sm" className="ml-1" onClick={() => { setYearFilter(String(new Date().getFullYear())); setPage(1); }}>今年</Button>
        </div>
      </div>

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
                  <div className="text-sm text-muted-foreground">{card.title}</div>
                  <div className="text-3xl font-bold text-foreground">{summaryLoading ? '...' : card.value}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">加载中...</div>
          ) : trendItems.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">暂无趋势数据</div>
          ) : (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <AreaChart data={trendItems.map(t => ({ ...t, score: t.avgScore }))}>
                <defs>
                  <linearGradient id="fillMyAssessment" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="period" tickLine={false} axisLine={false} className="text-xs text-muted-foreground" angle={-45} textAnchor="end" height={60} />
                <YAxis tickLine={false} axisLine={false} className="text-xs text-muted-foreground" domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="score" fill="url(#fillMyAssessment)" stroke="hsl(var(--chart-2))" strokeWidth={2} connectNulls />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Filter */}
      <Card className="rounded-xl">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <span className="text-sm text-muted-foreground">筛选：</span>
          <NativeSelect value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            {STATUS_OPTIONS.map((opt) => (
              <NativeSelectOption key={opt.value} value={opt.value}>{opt.label}</NativeSelectOption>
            ))}
          </NativeSelect>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card className="rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">我的考核记录</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">加载中...</div>
          ) : records.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">暂无考核记录</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-3 pr-4 font-medium text-left">考核周期</th>
                      <th className="py-3 pr-4 font-medium text-left">岗位</th>
                      <th className="py-3 pr-4 font-medium text-right">总分</th>
                      <th className="py-3 pr-4 font-medium text-center">等级</th>
                      <th className="py-3 pr-4 font-medium text-left">状态</th>
                      <th className="py-3 pr-4 font-medium text-left">签名状态</th>
                      <th className="py-3 pr-4 font-medium text-left">完成时间</th>
                      <th className="py-3 pr-4 font-medium text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record: MyAssessmentRecordItem) => (
                      <tr key={record.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 pr-4">{record.period}</td>
                        <td className="py-3 pr-4">{record.position}</td>
                        <td className="py-3 pr-4 text-right">{record.totalScore != null ? record.totalScore : '-'}</td>
                        <td className="py-3 pr-4 text-center">{record.grade || '-'}</td>
                        <td className="py-3 pr-4">{statusBadge(record.status)}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1">
                            {signBadge('自评', record.selfSignAt)}
                            {signBadge('上级', record.supervisorSignAt)}
                          </div>
                        </td>
                        <td className="py-3 pr-4">{record.completedAt ? new Date(record.completedAt).toLocaleString('zh-CN') : '-'}</td>
                        <td className="py-3 pr-4">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/assessment/${record.id}`)}>
                            <Eye className="size-4" />查看详情
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-sm text-muted-foreground">共 {total} 条</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p: number) => Math.max(1, p - 1))}>上一页</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}>下一页</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MyAssessmentsPage;
