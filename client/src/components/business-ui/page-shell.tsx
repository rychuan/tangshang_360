import React from 'react';
import { cn } from '@/lib/utils';

/**
 * 页面外壳：统一承载「视口高度级联 + 页头 + 内容区」的标准页面骨架。
 *
 * 背景：页面内容容器由 Layout 提供滚动（overflow-y-auto），若子页面想让自己
 * 的面板独立滚动，必须显式约束高度。历史实现中每个页面手写
 * `h-[calc(100svh-4rem-2.5rem)]` 之类的魔法数字（顶栏 4rem + 垂直内边距 2.5rem），
 * 顶部栏高度一变就要逐页修改。这里将视口约束收敛为单一常量。
 *
 * ⚠️ 若修改 AppTopbar 高度或 Layout 的垂直内边距，请同步更新
 * `PAGE_VIEWPORT_HEIGHT_CLASS`。
 */
export const PAGE_VIEWPORT_HEIGHT_CLASS = 'h-[calc(100svh-6.5rem)]';

export interface PageShellProps {
  /** 页头插槽（通常为 PageHeader 组件），不传则省略 */
  header?: React.ReactNode;
  /** 内容区：默认横向 flex（left aside + right section 布局）；需要纵向布局时传 className 覆盖 */
  children: React.ReactNode;
  /** 外壳附加类名 */
  className?: string;
  /** 内容区附加类名 */
  contentClassName?: string;
}

/**
 * 标准页面骨架：
 * ```
 * <PageShell header={<PageHeader/>}>
 *   <aside>…</aside>
 *   <section>…</section>
 * </PageShell>
 * ```
 */
export function PageShell({
  header,
  children,
  className,
  contentClassName,
}: PageShellProps) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col gap-4 md:gap-6',
        PAGE_VIEWPORT_HEIGHT_CLASS,
        className,
      )}
    >
      {header != null && <div className="shrink-0">{header}</div>}
      <div
        className={cn(
          'flex min-h-0 flex-1 gap-4 overflow-hidden',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
