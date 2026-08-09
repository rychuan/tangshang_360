import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { department as departmentApi } from '@/api';
import type { DepartmentTreeNode } from '@shared/api.interface';
import { BUILTIN_ROLE_CODES } from '@shared/api.interface';
import {
  buildTree,
  countEmployees,
  findNode,
  findNodeByName,
  findParentName,
} from './department-tree-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import DepartmentTreeSelect from '@/components/ui/department-tree-select';
import { usePermissions } from '@/hooks/usePermissions';
import {
  canCreateDepartment,
  canManageDepartmentHead,
  getDepartmentCommandCapabilities,
} from './employee-management-permissions';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserSelect } from '@/components/business-ui/user-select';
import { UserDisplay } from '@/components/business-ui/user-display';
import { toast } from 'sonner';
import { handleApiError, isApiNotFound } from '@client/src/utils/api-error';
import { useTableScrollHeight } from '@/hooks/useTableScrollHeight';
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
} from '@/components/ui/hugeicons';

interface DepartmentTreePanelProps {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export const DepartmentTreePanel: React.FC<DepartmentTreePanelProps> = ({
  selectedId,
  onSelect,
}) => {
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const { ability } = useAuth();
  // 部门树滚动区域与员工列表表格使用同一高度计算（底部对齐）
  const { tableRef, tableMaxHeight } = useTableScrollHeight();
  const identityRoles = useMemo(
    () =>
      ability
        ? BUILTIN_ROLE_CODES.filter((role) => ability.can(role, ROLE_SUBJECT))
        : [],
    [ability],
  );
  // 部门 CRUD 与负责人设置均需权限门槛（与 DepartmentManagementTab 旧语义一致）
  const { canEdit, canDelete } = getDepartmentCommandCapabilities(permissions);
  const canCreate = canCreateDepartment(permissions, identityRoles);
  const canManageHead = canManageDepartmentHead(permissions, identityRoles);
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

  // 数据加载完成后默认展开全部节点
  React.useEffect(() => {
    if (tree.length > 0) {
      const ids = new Set<string>();
      const collect = (nodes: DepartmentTreeNode[]) => {
        nodes.forEach((n) => {
          if (n.children?.length) {
            ids.add(n.id);
            collect(n.children);
          }
        });
      };
      collect(tree);
      setExpanded(ids);
    }
  }, [tree.length]);

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
      // 无负责人管理权限时不提交 headId（服务端保留原值）
      const headId = canManageHead ? form.headId || undefined : undefined;
      if (editingDept) {
        await departmentApi.update(editingDept.id, {
          name: form.name.trim(),
          parentId: form.parentId || undefined,
          headId,
        });
        toast.success('已更新');
      } else {
        await departmentApi.create({
          name: form.name.trim(),
          parentId: form.parentId || undefined,
          headId,
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

  const handleDelete = async (node: DepartmentTreeNode) => {
    const total = countEmployees(node);
    if (total > 0) {
      toast.error(
        `「${node.name}」及其子部门共有 ${total} 名员工，请先移出员工后再删除`,
      );
      return;
    }
    try {
      await departmentApi.remove(node.id);
      toast.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      if (selectedId === node.id) onSelect(null);
    } catch (e) {
      if (isApiNotFound(e)) {
        toast.warning('该部门已不存在或已被删除');
        queryClient.invalidateQueries({ queryKey: ['departments'] });
        if (selectedId === node.id) onSelect(null);
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
      const directCount = node.memberCount ?? 0;
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
            {node.headId && (
              <UserDisplay
                value={{ user_id: node.headId, name: node.headName }}
                size="small"
                showLabel={false}
                className="shrink-0 ml-1"
              />
            )}
            <span className="text-xs text-muted-foreground shrink-0 ml-0.5">
              {directCount}
            </span>
            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 ml-1">
              {canCreate && (
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
              )}
              {canEdit && (
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
              )}
              {canDelete && (
                <button
                  className="size-5 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(node);
                  }}
                  title="删除"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
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
    <div className="flex flex-col min-h-0">
      {/* 搜索栏 + 展开/折叠/新建部门（同一行） */}
      <div className="shrink-0 p-3 border-b">
        <div className="relative mb-2">
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
          <div className="flex-1" />
          {canCreate && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => openCreate('')}
            >
              <Plus data-icon="inline-start" />
              新建部门
            </Button>
          )}
        </div>
      </div>

      {/* 部门树（高度与员工列表表格一致） */}
      <div
        ref={tableRef}
        className="overflow-y-auto p-2"
        style={{ height: tableMaxHeight }}
      >
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

      {/* 新建/编辑弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{editingDept ? '编辑部门' : '新建部门'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">上级部门</Label>
              <DepartmentTreeSelect
                value={parentName}
                onChange={(name, id) => setForm({ ...form, parentId: id })}
                placeholder="无（顶级部门）"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">部门名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="请输入部门名称"
              />
            </div>
            {canManageHead && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">部门负责人</Label>
                <UserSelect
                  value={form.headId}
                  onChange={(v) => setForm({ ...form, headId: v || '' })}
                  placeholder="选择负责人"
                />
              </div>
            )}
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
