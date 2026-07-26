import React from 'react';

/**
 * 动态计算表格区域可用高度，确保筛选栏和分页固定不动，仅表格体滚动。
 * 使用 ResizeObserver 监测 body 布局变化，比 rAF/setTimeout 更可靠。
 */
export function useTableScrollHeight(): {
  tableRef: React.RefObject<HTMLDivElement | null>;
  tableMaxHeight: string;
} {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = React.useState(
    () => `${Math.max(200, window.innerHeight * 0.6)}px`,
  );

  React.useEffect(() => {
    const calcHeight = () => {
      if (!tableRef.current) return;
      const top = tableRef.current.getBoundingClientRect().top;
      const available = window.innerHeight - top - 16;
      setTableMaxHeight(`${Math.max(200, available)}px`);
    };

    // ResizeObserver 在 body 布局稳定后触发，比 rAF 更可靠
    const ro = new ResizeObserver(() => calcHeight());
    ro.observe(document.body);
    window.addEventListener('resize', calcHeight);

    // 多次延迟确保初始渲染完成
    const t1 = window.setTimeout(calcHeight, 50);
    const t2 = window.setTimeout(calcHeight, 200);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calcHeight);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return { tableRef, tableMaxHeight };
}
