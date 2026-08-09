import React from 'react';

/**
 * 计算表格/滚动面板的最大高度：使组件底部恰好落在视口底部（留 16px 边距），
 * 内部滚动容器成为唯一滚动者，避免出现整页多余滚动。
 *
 * @param measureDeps 布局可能变化的依赖（如筛选栏因权限加载而换行增高），
 *   变化时会重新测量，防止卡片高度过期导致底部内容（如分页栏）被挤到折叠线以下。
 */
export function useTableScrollHeight(
  measureDeps: React.DependencyList = [],
): {
  tableRef: React.RefObject<HTMLDivElement | null>;
  tableMaxHeight: string;
} {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = React.useState('400px');
  const retryCount = React.useRef(0);

  React.useEffect(() => {
    retryCount.current = 0;
    const measure = () => {
      if (!tableRef.current) return;
      const top = tableRef.current.getBoundingClientRect().top;
      // 妙搭平台可能有渲染延迟，重试直到拿到有效值
      if (top <= 0 && retryCount.current < 5) {
        retryCount.current += 1;
        const t = window.setTimeout(measure, 200);
        return () => window.clearTimeout(t);
      }
      if (top > 0) {
        setTableMaxHeight(`${Math.max(200, window.innerHeight - top - 16)}px`);
      }
      return undefined;
    };

    const cleanup = measure();

    const onResize = () => {
      if (!tableRef.current) return;
      const top = tableRef.current.getBoundingClientRect().top;
      if (top > 0) {
        setTableMaxHeight(`${Math.max(200, window.innerHeight - top - 16)}px`);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      if (cleanup) cleanup();
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...measureDeps]);

  return { tableRef, tableMaxHeight };
}
