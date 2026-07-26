import React from 'react';

/**
 * 动态计算表格区域可用高度，确保列表始终填满视口，不随数据量变化。
 * 使用 useLayoutEffect 同步测量 —— DOM 已布局但浏览器未绘制。
 */
export function useTableScrollHeight(): {
  tableRef: React.RefObject<HTMLDivElement | null>;
  tableMaxHeight: string;
} {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = React.useState('400px');

  React.useLayoutEffect(() => {
    const calcHeight = () => {
      if (!tableRef.current) return;
      const top = tableRef.current.getBoundingClientRect().top;
      if (top <= 0) return; // 元素尚未布局
      const available = window.innerHeight - top - 16;
      setTableMaxHeight(`${Math.max(200, available)}px`);
    };
    calcHeight();
    const ro = new ResizeObserver(() => calcHeight());
    ro.observe(document.body);
    window.addEventListener('resize', calcHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calcHeight);
    };
  }, []);

  return { tableRef, tableMaxHeight };
}
