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

export interface MultiDepartmentTreeSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

const MultiDepartmentTreeSelect: React.FC<MultiDepartmentTreeSelectProps> = ({
  value,
  onChange,
  placeholder = '选择部门',
  className,
}) => {
  const [open, setOpen] = useState<boolean>(false);
  const [tree, setTree] = useState<DepartmentTreeNode[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
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

  const toggleSelect = (name: string): void => {
    if (value.includes(name)) {
      onChange(value.filter((v: string) => v !== name));
    } else {
      onChange([...value, name]);
    }
  };

  const renderNode = (
    node: DepartmentTreeNode,
    depth: number,
  ): React.ReactNode => {
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = value.includes(node.name);
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer ${isSelected ? 'bg-primary/10 text-primary font-medium' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => toggleSelect(node.name)}
        >
          {hasChildren ? (
            <button
              type="button"
              className="p-0.5 hover:bg-muted rounded"
              onClick={(e: React.MouseEvent) => {
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
          node.children.map((child: DepartmentTreeNode) =>
            renderNode(child, depth + 1),
          )}
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
          className={`justify-between font-normal ${className ?? ''}`}
        >
          <span className={value.length > 0 ? '' : 'text-muted-foreground'}>
            {value.length > 0 ? `已选 ${value.length} 个部门` : placeholder}
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
          <>
            <div className="max-h-64 overflow-y-auto">
              {tree.map((node: DepartmentTreeNode) => renderNode(node, 0))}
            </div>
            {value.length > 0 && (
              <div className="mt-1 border-t pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => onChange([])}
                >
                  清空选择
                </Button>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default MultiDepartmentTreeSelect;
