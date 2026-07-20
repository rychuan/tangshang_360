import { ArrowUpRight, CircleAlert, Grid2X2, RefreshCw } from '@/components/ui/hugeicons';
import { Link } from 'react-router-dom';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  resolveSectionStatus,
  type DashboardQuickAction,
} from './dashboard-utils';

interface DashboardQuickActionsProps {
  items: DashboardQuickAction[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

const TONE_CLASSES: Record<DashboardQuickAction['tone'], string> = {
  blue: 'bg-info/10 text-info',
  orange: 'bg-warning/10 text-warning',
  purple: 'bg-primary/10 text-primary',
  green: 'bg-success/10 text-success',
};

export function DashboardQuickActions({
  items,
  loading,
  error,
  onRetry,
}: DashboardQuickActionsProps) {
  const status = resolveSectionStatus({
    hasData: items.length > 0,
    loading,
    error,
  });

  return (
    <Card className="flex min-w-0 flex-col rounded-lg">
      <CardHeader className="gap-1 p-5 pb-3">
        <CardTitle className="text-[14px] leading-5">快捷入口</CardTitle>
        <CardDescription className="text-[12px]">
          仅展示当前有权访问的功能
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 p-5 pt-2">
        {status === 'loading' && (
          <div className="grid min-h-[170px] w-full grid-cols-1 content-center gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[68px] w-full" />
            ))}
          </div>
        )}

        {status === 'error' && (
          <Empty className="min-h-[170px] w-full p-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">快捷入口加载失败</EmptyTitle>
              <EmptyDescription>暂时无法获取可用入口。</EmptyDescription>
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
                <Grid2X2 className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">暂无快捷入口</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}

        {status === 'ready' && (
          <div className="grid min-h-[170px] w-full grid-cols-1 content-center gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="group flex min-w-0 items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-lg',
                    TONE_CLASSES[item.tone],
                  )}
                >
                  <item.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {item.title}
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
