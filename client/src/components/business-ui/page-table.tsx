import React from 'react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { ChevronLeft, ChevronRight, Inbox } from '@/components/ui/hugeicons';

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

interface PageTableColumn<T> {
  key: string;
  header: React.ReactNode;
  className?: string;
  headerClassName?: string;
  align?: 'left' | 'center' | 'right';
  render: (item: T, index: number) => React.ReactNode;
}

// ---------------------------------------------------------------------------
// PageTable props
// ---------------------------------------------------------------------------

interface PageTableProps<T> {
  columns: PageTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  renderEmpty?: () => React.ReactNode;
  page?: number;
  totalPages?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  toolbar?: React.ReactNode;
  className?: string;
}

const ALIGN_CLASSES: Record<string, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function PageTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage = '暂无数据',
  emptyIcon,
  renderEmpty,
  page,
  totalPages,
  total,
  onPageChange,
  toolbar,
  className,
}: PageTableProps<T>) {
  return (
    <div className={cn('overflow-hidden rounded-lg border', className)}>
      {toolbar && (
        <div className="flex items-center gap-3 border-b px-4 py-3">
          {toolbar}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner className="size-6" />
        </div>
      )}

      {!loading && data.length === 0 && (
        <>
          {renderEmpty ? (
            renderEmpty()
          ) : (
            <div className="flex items-center justify-center py-12">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {emptyIcon || <Inbox className="size-6" />}
                  </EmptyMedia>
                  <EmptyTitle>{emptyMessage}</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </>
      )}

      {!loading && data.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  {columns.map((col) => (
                    <TableHead
                      key={col.key}
                      className={cn(
                        ALIGN_CLASSES[col.align ?? 'left'],
                        'font-medium',
                        col.headerClassName,
                      )}
                    >
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item, idx) => (
                  <TableRow key={idx} className="group">
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(
                          ALIGN_CLASSES[col.align ?? 'left'],
                          col.className,
                        )}
                      >
                        {col.render(item, idx)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {page != null && totalPages != null && totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {'共'} {total ?? data.length} {'条'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => onPageChange?.(Math.max(1, page - 1))}
                >
                  <ChevronLeft data-icon="inline-start" />
                  {'上一页'}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange?.(Math.min(totalPages, page + 1))}
                >
                  {'下一页'}
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export { PageTable };
export type { PageTableProps, PageTableColumn };
