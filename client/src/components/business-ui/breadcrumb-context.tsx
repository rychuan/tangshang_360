import React, { createContext, useContext, useState, useCallback } from 'react';

interface BreadcrumbContextValue {
  /** 子页面设置的自定义面包屑标签，null 表示使用默认逻辑 */
  label: string | null;
  setLabel: (label: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  label: null,
  setLabel: () => {},
});

export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const handleSetLabel = useCallback((l: string | null) => setLabel(l), []);
  return (
    <BreadcrumbContext.Provider value={{ label, setLabel: handleSetLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}
