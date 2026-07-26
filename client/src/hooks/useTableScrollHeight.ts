import React from 'react';

export function useTableScrollHeight(): {
  tableRef: React.RefObject<HTMLDivElement | null>;
  tableMaxHeight: string;
} {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = React.useState('400px');
  const retryCount = React.useRef(0);

  React.useEffect(() => {
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
  }, []);

  return { tableRef, tableMaxHeight };
}
