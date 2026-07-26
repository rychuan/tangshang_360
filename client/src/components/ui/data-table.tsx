'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';
import {
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Inbox } from '@/components/ui/hugeicons';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  loading?: boolean;
  loadingRows?: number;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  loading = false,
  loadingRows = 5,
  emptyMessage = '暂无数据',
  emptyIcon,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: { sorting, columnVisibility },
  });

  if (loading) {
    return (
      <div className="w-full">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              {columns.map((_, i) => (
                <TableHead key={i} className="h-10 px-4 font-medium">
                  <Skeleton className="h-4 w-16" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: loadingRows }).map((_, ri) => (
              <TableRow key={ri}>
                {columns.map((_, ci) => (
                  <TableCell key={ci} className="py-3 px-4">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
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
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="bg-muted/30 hover:bg-muted/30"
            >
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as
                  | { headerClass?: string; cellClass?: string }
                  | undefined;
                return (
                  <TableHead
                    key={header.id}
                    className={`h-10 px-4 font-medium text-muted-foreground ${meta?.headerClass ?? ''}`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && 'selected'}
              className={cn('group', onRowClick && 'cursor-pointer')}
              onClick={() => onRowClick?.(row.original)}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as
                  | { headerClass?: string; cellClass?: string }
                  | undefined;
                return (
                  <TableCell
                    key={cell.id}
                    className={`py-3 px-4 ${meta?.cellClass ?? ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
