import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { department as departmentApi } from '@/api';
import type { DepartmentTreeNode } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserSelect } from '@/components/business-ui/user-select';
import { toast } from 'sonner';
import { handleApiError, isApiNotFound } from '@client/src/utils/api-error';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  Building2,
  Search,
  X,
  Minus,
  FolderPlus,
} from '@/components/ui/hugeicons';

interface DepartmentTreePanelProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function buildTree(
  nodes: DepartmentTreeNode[],
  filter: string,
): DepartmentTreeNode[] {
  if (!filter) return nodes;
  const lower = filter.toLowerCase();
  const match = (n: DepartmentTreeNode): boolean =>
    n.name.toLowerCase().includes(lower) || (n.children?.some(match) ?? false);
  return nodes
    .filter(match)
    .map((n) => ({ ...n, children: buildTree(n.children, filter) }));
}

function countEmployees(node: DepartmentTreeNode): number {
  const childCount =
    node.children?.reduce((sum, c) => sum + countEmployees(c), 0) ?? 0;
  return (node.memberCount ?? 0) + childCount;
}

/** 获取所有子孙节点 ID */
function getAllDescendantIds(node: DepartmentTreeNode): string[] {
  const ids = [node.id];
  node.children?.forEach((c) => ids.push(...getAllDescendantIds(c)));
  return ids;
}

/** 在树中查找节点 */
function findNode(
  nodes: DepartmentTreeNode[],
  id: string,
): DepartmentTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 在树中查找节点的父级名称 */
function findParentName(nodes: DepartmentTreeNode[], parentId: string): string {
  for (const n of nodes) {
    if (n.id === parentId) return n.name;
    if (n.children?.length) {
      const found = findParentName(n.children, parentId);
      if (found) return found;
    }
  }
  return '';
}

export const DepartmentTreePanel: React.FC<DepartmentTreePanelProps> = ({
  selectedId,
  onSelect,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentTreeNode | null>(
    null,
  );
  const [form, setForm] = useState({
    name: '',
    parentId: '',
    headId: '',
  });
  const [saving, setSaving] = useState(false);

  const { data: deptData, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentApi.list(),
  });
  const tree = deptData?.tree ?? [];
  const filtered = buildTree(tree, search);

  const parentName = form.parentId ? findParentName(tree, form.parentId) : '';

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /** 全部展开 */
  const expandAll = () => {
    const ids = new Set<string>();
    const collect = (nodes: DepartmentTreeNode[]) => {
      nodes.forEach((n) => {
        if (n.children?.length) {
          ids.add(n.id);
          collect(n.children);
        }
      });
    };
    collect(filtered);
    setExpanded(ids);
  };

  /** 全部折叠 */
  const collapseAll = () => {
    setExpanded(new Set());
  };

  /** 选中部门时自动展开子级 */
  const handleSelect = (id: string) => {
    onSelect(id);
    const node = findNode(tree, id);
    if (node?.children?.length && !expanded.has(id)) {
      setExpanded((prev) => new Set(prev).add(id));
    }
  };

  const openCreate = (parentId: string) => {
    setEditingDept(null);
    setForm({ name: '', parentId, headId: '' });
    setFormOpen(true);
  };

  const openEdit = (node: DepartmentTreeNode) => {
    setEditingDept(node);
    setForm({
      name: node.name,
      parentId: node.parentId ?? '',
      headId: node.headId ?? '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('请输入部门名称');
      return;
    }
    setSaving(true);
    try {
      if (editingDept) {
        await departmentApi.update(editingDept.id, {
          name: form.name.trim(),
          headId: form.headId || undefined,
        });
        toast.success('已更新');
      } else {
        await departmentApi.create({
          name: form.name.trim(),
          parentId: form.parentId || undefined,
          headId: form.headId || undefined,
        });
        toast.success('已创建');
      }
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    } catch (e) {
      handleApiError(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await departmentApi.remove(id);
      toast.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      if (selectedId === id) onSelect(null);
    } catch (e) {
      if (isApiNotFound(e)) {
        toast.warning('该部门已不存在或已被删除');
        queryClient.invalidateQueries({ queryKey: ['departments'] });
        if (selectedId === id) onSelect(null);
        return;
      }
      handleApiError(e);
    }
  };

  const renderTree = (
    nodes: DepartmentTreeNode[],
    depth: number,
  ): React.ReactNode => {
    return nodes.map((node) => {
      const isExpanded = expanded.has(node.id);
      const hasChildren = node.children?.length > 0;
      const total = countEmployees(node);
      return (
        <div key={node.id}>
          <div
            className={`flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer text-sm group ${
              selectedId === node.id
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-muted/50'
            }`}
            style={{ paddingLeft: `${8 + depth * 16}px` }}
            onClick={() => handleSelect(node.id)}
          >
            {hasChildren ? (
              <button
                className="size-4 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.id);
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{node.name}</span>
            {total > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">
                {total}
              </span>
            )}
            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1">
              <button
                className="size-5 flex items-center justify-center rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  openCreate(node.id);
                }}
                title="添加子部门"
              >
                <Plus className="size-3" />
              </button>
              <button
                className="size-5 flex items-center justify-center rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(node);
                }}
                title="编辑"
              >
                <Pencil className="size-3" />
              </button>
              <button
                className="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(node.id);
                }}
                title="删除"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
          {hasChildren && isExpanded && (
            <div>{renderTree(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* 搜索栏 + 展开/折叠按钮 */}
      <div className="shrink-0 p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            className="pl-8 pr-8 h-8 text-xs"
            placeholder="搜索部门..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 size-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')}
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={expandAll}
            title="全部展开"
          >
            <Plus className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={collapseAll}
            title="全部折叠"
          >
            <Minus className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* 部门树 */}
      <div className="flex-1 overflow-y-auto p-2">
        <div
          className={`flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer text-sm ${
            selectedId === null
              ? 'bg-primary/10 text-primary font-medium'
              : 'hover:bg-muted/50'
          }`}
          onClick={() => onSelect(null)}
        >
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span>全部部门</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="size-5" />
          </div>
        ) : (
          renderTree(filtered, 0)
        )}
      </div>

      {/* 新建部门按钮 */}
      <div className="shrink-0 p-2 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start text-xs"
          onClick={() => openCreate('')}
        >
          <Plus className="size-3.5" /> 新建部门
        </Button>
      </div>

      {/* 新建/编辑弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingDept ? '编辑部门' : '新建部门'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {parentName && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">上级部门</Label>
                <p className="text-sm text-muted-foreground">{parentName}</p>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">部门名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="请输入部门名称"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">部门负责人</Label>
              <UserSelect
                value={form.headId}
                onChange={(v) => setForm({ ...form, headId: v || '' })}
                placeholder="选择负责人"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFormOpen(false)}
            >
              取消
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
