import {
  AreaChart as AreaChartIcon,
  BarChart3,
  CircleAlert,
  RefreshCw,
} from '@/components/ui/hugeicons';
import type { LucideIcon } from '@/components/ui/hugeicons';
import type { DashboardOverviewResponse } from '@shared/api.interface';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { mapGradeDistribution, resolveSectionStatus } from './dashboard-utils';

interface DashboardChartsProps {
  stats?: DashboardOverviewResponse['stats'];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

const chartConfig = {
  count: { label: '人数', color: 'var(--chart-1)' },
  score: { label: '平均分', color: 'var(--chart-2)' },
} satisfies ChartConfig;

export function DashboardCharts({
  stats,
  loading,
  error,
  onRetry,
}: DashboardChartsProps) {
  const status = resolveSectionStatus({
    hasData: Boolean(stats),
    loading,
    error,
  });

  return (
    <section className="min-w-0">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold">绩效洞察</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          查看平均分趋势与绩效等级分布
        </p>
      </div>

      {status === 'loading' && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,.85fr)]">
          {Array.from({ length: 2 }).map((_, index) => (
            <Card key={index} className="rounded-lg">
              <CardHeader className="p-5 pb-3">
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="p-5 pt-0">
                <Skeleton className="h-[280px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {status === 'error' && (
        <Card className="rounded-lg">
          <Empty className="min-h-[280px] p-5">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">图表加载失败</EmptyTitle>
              <EmptyDescription>暂时无法获取绩效图表数据。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw />
                重试
              </Button>
            </EmptyContent>
          </Empty>
        </Card>
      )}

      {status === 'empty' && (
        <Card className="rounded-lg">
          <ChartEmpty icon={AreaChartIcon} title="暂无图表数据" />
        </Card>
      )}

      {status === 'ready' && stats && <ChartsContent stats={stats} />}
    </section>
  );
}

function ChartsContent({
  stats,
}: {
  stats: DashboardOverviewResponse['stats'];
}) {
  const trendData = stats.trend ?? [];
  const gradeData = mapGradeDistribution(stats.gradeDistribution);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,.85fr)]">
      <Card className="min-w-0 rounded-lg">
        <CardHeader className="gap-1 p-5 pb-3">
          <div className="flex items-center gap-2">
            <AreaChartIcon className="size-4 text-muted-foreground" />
            <CardTitle className="text-[14px] leading-5">绩效趋势</CardTitle>
          </div>
          <CardDescription className="text-[12px]">
            各周期平均分变化
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          {trendData.length === 0 ? (
            <ChartEmpty icon={AreaChartIcon} title="暂无趋势数据" />
          ) : (
            <ChartContainer
              config={chartConfig}
              className="h-[280px] w-full min-w-0"
            >
              <AreaChart
                accessibilityLayer
                data={trendData}
                margin={{ left: 0, right: 8 }}
              >
                <defs>
                  <linearGradient
                    id="dashboard-fill-score"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
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
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  domain={[0, 100]}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="score"
                  fill="url(#dashboard-fill-score)"
                  stroke="var(--color-score)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 rounded-lg">
        <CardHeader className="gap-1 p-5 pb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" />
            <CardTitle className="text-[14px] leading-5">等级分布</CardTitle>
          </div>
          <CardDescription className="text-[12px]">
            各绩效等级人数分布
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          {gradeData.length === 0 ? (
            <ChartEmpty icon={BarChart3} title="暂无等级数据" />
          ) : (
            <ChartContainer
              config={chartConfig}
              className="h-[280px] w-full min-w-0"
            >
              <BarChart
                accessibilityLayer
                data={gradeData}
                margin={{ left: 0, right: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="grade"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="count"
                  fill="var(--color-count)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChartEmpty({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Empty className="min-h-[280px] p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-[14px]">{title}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}
