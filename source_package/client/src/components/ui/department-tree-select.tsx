import React, { useState, useEffect, useCallback } from 'react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type { DepartmentTreeNode, DepartmentListResponse } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Building2, ChevronRight, ChevronDown, Check } from 'lucide-react';

export interface DepartmentTreeSelectProps {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
}

const DepartmentTreeSelect: React.FC<DepartmentTreeSelectProps> = ({
  value,
  onChange,
  placeholder = '选择部门',
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [tree, setTree] = useState<DepartmentTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axiosForBackend<DepartmentListResponse>({
        url: '/api/departments',
        method: 'GET',
      });
      setTree(data.tree);
      setExpanded(new Set(data.tree.map((n: DepartmentTreeNode) => n.id)));
    } catch (err) {
      logger.error('加载部门树失败', err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const toggleExpand = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (name: string): void => {
    onChange(name);
    setOpen(false);
  };

  const renderNode = (node: DepartmentTreeNode, depth: number): React.ReactNode => {
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = node.name === value;
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer ${isSelected ? 'bg-primary/10 text-primary font-medium' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => handleSelect(node.name)}
        >
          {hasChildren ? (
            <button
              type="button"
              className="p-0.5 hover:bg-muted rounded"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-[18px]" />
          )}
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
          {isSelected && <Check className="ml-auto h-3.5 w-3.5" />}
        </div>
        {isOpen &&
          hasChildren &&
          node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-full justify-between font-normal ${className ?? ''}`}
        >
          <span className={value ? '' : 'text-muted-foreground'}>
            {value || placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2" align="start">
        {loading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            加载中...
          </p>
        ) : tree.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            暂无部门数据
          </p>
        ) : (
          <div className="max-h-64 overflow-y-auto">
            <div
              className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer ${!value ? 'bg-primary/10 text-primary font-medium' : ''}`}
              onClick={() => handleSelect('')}
            >
              <span className="w-[18px]" />
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate">全部部门</span>
              {!value && <Check className="ml-auto h-3.5 w-3.5" />}
            </div>
            {tree.map((node) => renderNode(node, 0))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default DepartmentTreeSelect;
