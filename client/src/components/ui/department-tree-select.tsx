import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  DepartmentTreeNode,
  DepartmentListResponse,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  Check,
  Search,
} from '@/components/ui/hugeicons';

export interface DepartmentTreeSelectProps {
  value: string;
  onChange: (name: string, id: string) => void;
  placeholder?: string;
  className?: string;
}

/** 递归过滤部门树：保留名称匹配或子节点有匹配的节点 */
function filterTree(
  nodes: DepartmentTreeNode[],
  term: string,
): DepartmentTreeNode[] {
  const lower = term.toLowerCase();
  const result: DepartmentTreeNode[] = [];
  for (const node of nodes) {
    const nameMatch = node.name.toLowerCase().includes(lower);
    const filteredChildren = node.children
      ? filterTree(node.children, term)
      : [];
    if (nameMatch || filteredChildren.length > 0) {
      result.push({
        ...node,
        children:
          filteredChildren.length > 0 ? filteredChildren : node.children,
      });
    }
  }
  return result;
}

/** 收集树中所有节点的 id */
function collectIds(nodes: DepartmentTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.id);
    if (node.children) {
      ids.push(...collectIds(node.children));
    }
  }
  return ids;
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
  const [searchTerm, setSearchTerm] = useState('');

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

  // 搜索时自动展开所有节点
  useEffect(() => {
    if (searchTerm && tree.length > 0) {
      setExpanded(new Set(collectIds(tree)));
    }
  }, [searchTerm, tree]);

  // 关闭弹窗时清空搜索
  useEffect(() => {
    if (!open) {
      setSearchTerm('');
    }
  }, [open]);

  const filteredTree = useMemo(
    () => (searchTerm ? filterTree(tree, searchTerm) : tree),
    [tree, searchTerm],
  );

  const toggleExpand = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (name: string, id: string): void => {
    onChange(name, id);
    setOpen(false);
  };

  const renderNode = (
    node: DepartmentTreeNode,
    depth: number,
  ): React.ReactNode => {
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = node.name === value;
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer ${isSelected ? 'bg-primary/10 text-primary font-medium' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => handleSelect(node.name, node.id)}
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
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{node.name}</span>
          {isSelected && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
        </div>
        {isOpen &&
          hasChildren &&
          node.children!.map((child) => renderNode(child, depth + 1))}
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
      <PopoverContent
        className="w-[280px] p-0 overflow-hidden"
        align="start"
        sideOffset={4}
        collisionPadding={8}
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-1.5 border-b px-2 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <Input
            className="h-7 border-0 bg-transparent px-0 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            placeholder="搜索部门..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {/* 可滚动的部门树 */}
        <div className="max-h-64 overflow-y-auto p-2">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              加载中...
            </p>
          ) : tree.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              暂无部门数据
            </p>
          ) : filteredTree.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              无匹配部门
            </p>
          ) : (
            <>
              {/* "全部部门"选项 — 仅非搜索状态显示 */}
              {!searchTerm && (
                <div
                  className={`flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60 cursor-pointer ${!value ? 'bg-primary/10 text-primary font-medium' : ''}`}
                  onClick={() => handleSelect('', '')}
                >
                  <span className="w-[18px]" />
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">全部部门</span>
                  {!value && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                </div>
              )}
              {filteredTree.map((node) => renderNode(node, 0))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DepartmentTreeSelect;
