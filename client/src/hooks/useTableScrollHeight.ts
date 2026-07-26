import React from 'react';

/**
 * 动态计算表格区域可用高度，确保筛选栏和分页固定不动，仅表格体滚动。
 * 返回 ref 绑定到表格容器，表格体设置 style={{ maxHeight }} 即可。
 */
export function useTableScrollHeight(): {
  tableRef: React.RefObject<HTMLDivElement | null>;
  tableMaxHeight: string;
} {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = React.useState(() => `${Math.max(200, window.innerHeight * 0.6)}px`);

  React.useEffect(() => {
    const calcHeight = () => {
      requestAnimationFrame(() => {
        if (!tableRef.current) return;
        const top = tableRef.current.getBoundingClientRect().top;
        const available = window.innerHeight - top - 16;
        setTableMaxHeight(`${Math.max(200, available)}px`);
      });
    };
    // 首次延迟一帧等待 DOM 布局稳定
    const id = window.setTimeout(calcHeight, 16);
    window.addEventListener('resize', calcHeight);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', calcHeight);
    };
  }, []);

  return { tableRef, tableMaxHeight };
}
