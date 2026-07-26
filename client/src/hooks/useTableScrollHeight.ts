import React from 'react';

export function useTableScrollHeight(): {
  tableRef: React.RefObject<HTMLDivElement | null>;
  tableMaxHeight: string;
} {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = React.useState('400px');

  React.useLayoutEffect(() => {
    let ro: ResizeObserver | null = null;

    const calcHeight = () => {
      if (!tableRef.current) return;
      const top = tableRef.current.getBoundingClientRect().top;
      if (top <= 0) return;
      setTableMaxHeight(`${Math.max(200, window.innerHeight - top - 16)}px`);
    };

    // setImmediate-style deferral: layout is guaranteed complete
    const id = window.setTimeout(() => {
      calcHeight();
      ro = new ResizeObserver(() => calcHeight());
      ro.observe(document.body);
    }, 0);

    window.addEventListener('resize', calcHeight);

    return () => {
      window.clearTimeout(id);
      ro?.disconnect();
      window.removeEventListener('resize', calcHeight);
    };
  }, []);

  return { tableRef, tableMaxHeight };
}
