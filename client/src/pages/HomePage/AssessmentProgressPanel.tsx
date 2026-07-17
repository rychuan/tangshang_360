import { CircleAlert, Gauge, RefreshCw } from 'lucide-react';
import type { DashboardOverviewResponse } from '@shared/api.interface';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { buildProgress, resolveSectionStatus } from './dashboard-utils';

interface AssessmentProgressPanelProps {
  stats?: DashboardOverviewResponse['stats'];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

export function AssessmentProgressPanel({
  stats,
  loading,
  error,
  onRetry,
}: AssessmentProgressPanelProps) {
  const status = resolveSectionStatus({
    hasData: Boolean(stats),
    loading,
    error,
  });

  return (
    <Card className="flex min-w-0 flex-col rounded-lg">
      <CardHeader className="gap-1 p-5 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Gauge className="size-4" />
          </span>
          <div className="min-w-0">
            <CardTitle className="text-[14px] leading-5">
              本期考核进度
            </CardTitle>
            <CardDescription className="text-[12px]">
              完成情况基于当前考核数据
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 p-5 pt-2">
        {status === 'loading' && (
          <div className="flex min-h-[170px] w-full flex-col justify-center gap-5">
            <div className="flex items-end justify-between gap-4">
              <Skeleton className="h-12 w-24" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-2 w-full" />
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          </div>
        )}

        {status === 'error' && (
          <Empty className="min-h-[170px] w-full p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">进度加载失败</EmptyTitle>
              <EmptyDescription>暂时无法获取本期考核进度。</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCw />
                重试
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {status === 'empty' && (
          <Empty className="min-h-[170px] w-full p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Gauge className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">暂无进度数据</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}

        {status === 'ready' && stats && <ProgressContent stats={stats} />}
      </CardContent>
    </Card>
  );
}

function ProgressContent({
  stats,
}: {
  stats: DashboardOverviewResponse['stats'];
}) {
  const progress = buildProgress(stats);

  return (
    <div className="flex min-h-[170px] w-full flex-col justify-center">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[34px] font-semibold leading-none tabular-nums">
            {progress.percentage}%
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">整体完成率</p>
        </div>
        <p className="text-[13px] text-muted-foreground">
          已完成{' '}
          <span className="font-semibold text-foreground tabular-nums">
            {progress.completed}
          </span>{' '}
          / {progress.total}
        </p>
      </div>
      <Progress
        value={progress.percentage}
        aria-label={`本期考核完成率 ${progress.percentage}%`}
        className="mt-5"
      />
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          ['已完成', progress.completed],
          ['待处理', progress.pending],
          ['任务总数', progress.total],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <p className="text-[17px] font-semibold tabular-nums">{value}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
