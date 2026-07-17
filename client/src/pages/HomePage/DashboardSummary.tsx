import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import type { DashboardOverviewResponse } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { resolveSectionStatus } from './dashboard-utils';

interface DashboardSummaryProps {
  stats?: DashboardOverviewResponse['stats'];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

export function DashboardSummary({
  stats,
  loading,
  error,
  onRetry,
}: DashboardSummaryProps) {
  const status = resolveSectionStatus({
    hasData: Boolean(stats),
    loading,
    error,
  });

  return (
    <section className="min-w-0">
      <div className="mb-3">
        <h2 className="text-[14px] font-semibold">绩效摘要</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          累计考核数据的关键概览
        </p>
      </div>

      {status === 'loading' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="rounded-lg">
              <CardContent className="p-5">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {status === 'error' && (
        <Card className="rounded-lg">
          <Empty className="min-h-[180px] p-5">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">摘要加载失败</EmptyTitle>
              <EmptyDescription>暂时无法获取绩效摘要。</EmptyDescription>
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
          <Empty className="min-h-[180px] p-5">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TrendingUp className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">暂无摘要数据</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </Card>
      )}

      {status === 'ready' && stats && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            title="待处理"
            description="尚待处理的考核数量"
            value={stats.pendingCount}
            icon={Clock3}
            tone="bg-warning/10 text-warning"
          />
          <SummaryCard
            title="已完成"
            description="累计已完成的考核数量"
            value={stats.completedCount}
            icon={CheckCircle2}
            tone="bg-success/10 text-success"
          />
          <SummaryCard
            title="平均分"
            description="已纳入统计的考核平均得分"
            value={stats.avgScore ?? '暂无数据'}
            icon={TrendingUp}
            tone="bg-info/10 text-info"
          />
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  title,
  description,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  description: string;
  value: number | string;
  icon: typeof Clock3;
  tone: string;
}) {
  return (
    <Card className="min-w-0 rounded-lg">
      <CardHeader className="flex-row items-start justify-between gap-3 p-5 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-[14px] leading-5">{title}</CardTitle>
          <CardDescription className="mt-1 truncate text-[12px]">
            {description}
          </CardDescription>
        </div>
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-lg',
            tone,
          )}
        >
          <Icon className="size-4" />
        </span>
      </CardHeader>
      <CardContent className="p-5 pt-2">
        <p className="truncate text-[26px] font-semibold leading-none tabular-nums">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
