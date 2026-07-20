import {
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  RefreshCw,
  Users,
} from '@/components/ui/hugeicons';
import { Link } from 'react-router-dom';
import type { DashboardTodosResponse } from '@shared/api.interface';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
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

interface DashboardTodoGridProps {
  items: DashboardTodosResponse['items'];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

type TodoType = DashboardTodosResponse['items'][number]['type'];

const TODO_META: Record<
  TodoType,
  {
    label: string;
    icon: typeof ClipboardCheck;
    tone: string;
  }
> = {
  self_review: {
    label: '员工评分',
    icon: ClipboardCheck,
    tone: 'bg-info/10 text-info',
  },
  supervisor_review: {
    label: '上级评分',
    icon: Users,
    tone: 'bg-warning/10 text-warning',
  },
};

export function DashboardTodoGrid({
  items,
  loading,
  error,
  onRetry,
}: DashboardTodoGridProps) {
  const status = resolveSectionStatus({
    hasData: items.length > 0,
    loading,
    error,
  });

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">待办任务</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            及时处理需要你完成的考核事项
          </p>
        </div>
        {status === 'ready' && (
          <Badge variant="secondary" className="shrink-0">
            {items.length} 项
          </Badge>
        )}
      </div>

      {status === 'loading' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="rounded-lg">
              <CardHeader className="p-4">
                <Skeleton className="h-14 w-full" />
              </CardHeader>
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
              <EmptyTitle className="text-[14px]">待办任务加载失败</EmptyTitle>
              <EmptyDescription>
                其他首页数据不受影响，可以单独重试此区块。
              </EmptyDescription>
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
                <CheckCircle2 className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-[14px]">暂无待办任务</EmptyTitle>
            </EmptyHeader>
          </Empty>
        </Card>
      )}

      {status === 'ready' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((todo) => {
            const meta = TODO_META[todo.type];
            const Icon = meta.icon;

            return (
              <Link
                key={todo.id}
                to={`/assessment/${todo.id}`}
                className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full rounded-lg transition-colors hover:bg-accent/50">
                  <CardHeader className="h-full gap-4 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn(
                          'grid size-10 shrink-0 place-items-center rounded-lg',
                          meta.tone,
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-[14px] leading-5">
                          {todo.title}
                        </CardTitle>
                        <p className="mt-1 truncate text-[12px] text-muted-foreground">
                          {todo.period}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {meta.label}
                      </Badge>
                    </div>
                    {todo.deadline && (
                      <div className="mt-auto flex items-center gap-2 text-[12px] text-muted-foreground">
                        <Clock3 className="size-4 shrink-0" />
                        <span className="truncate">截止 {todo.deadline}</span>
                      </div>
                    )}
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
