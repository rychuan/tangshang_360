import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { department as departmentApi } from '@/api';
import { handleApiError, isApiNotFound } from '@client/src/utils/api-error';
import type {
  DepartmentItem,
  DepartmentTreeNode,
  CreateDepartmentRequest,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { ActionBadge } from '@/components/business-ui/action-badge';
import { Spinner } from '@/components/ui/spinner';
import { UserDisplay } from '@/components/business-ui/user-display';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserSelect } from '@/components/business-ui/user-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  Building2,
  Users,
} from '@/components/ui/hugeicons';
import { showConfirm } from '@lark-apaas/client-toolkit';
import DepartmentMembersDialog from './DepartmentMembersDialog';
import { CanDo, usePermission, usePermissions } from '@/hooks/usePermissions';
import { COMMAND_PERMISSIONS } from '@/components/permission-policy';
import { BUILTIN_ROLE_CODES } from '@shared/api.interface';
import {
  canManageDepartmentHead,
  canCreateDepartment,
  getDepartmentCommandCapabilities,
} from './employee-management-permissions';

interface DeptFormData {
  name: string;
  parentId: string;
  headId: string;
  sortOrder: number;
}

function renderTreeOptions(
  nodes: DepartmentTreeNode[],
  excludeId?: string,
  depth = 0,
): React.ReactNode[] {
  return nodes.flatMap((node) => {
    const items: React.ReactNode[] = [];
    if (node.id !== excludeId) {
      items.push(
        <SelectItem key={node.id} value={node.id}>
          <span style={{ paddingLeft: `${depth * 1.25}rem` }}>
            {depth > 0 && '├ '}
            {node.name}
          </span>
        </SelectItem>,
      );
    }
    if (node.children?.length) {
      items.push(...renderTreeOptions(node.children, excludeId, depth + 1));
    }
    return items;
  });
}

const DepartmentManagementTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const { ability } = useAuth();
  const identityRoles = useMemo(
    () =>
      ability
        ? BUILTIN_ROLE_CODES.filter((role) => ability.can(role, ROLE_SUBJECT))
        : [],
    [ability],
  );
  const { canEdit, canDelete } = getDepartmentCommandCapabilities(permissions);
  const canCreate = canCreateDepartment(permissions, identityRoles);
  const canManageHead = canManageDepartmentHead(permissions, identityRoles);
  const canViewEmployees = usePermission('employees', 'view');

  const { data: deptData, isLoading: loading } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentApi.list(),
  });
  const items = deptData?.items ?? [];
  const tree = deptData?.tree ?? [];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [formData, setFormData] = useState<DeptFormData>({
    name: '',
    parentId: '',
    headId: '',
    sortOrder: 0,
  });

  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [membersDeptName, setMembersDeptName] = useState('');

  const handleSave = async (): Promise<void> => {
    if (!formData.name.trim()) {
      toast.error('请输入部门名称');
      return;
    }
    try {
      const body: CreateDepartmentRequest = {
        name: formData.name.trim(),
        parentId: formData.parentId || undefined,
        headId: formData.headId || undefined,
        sortOrder: formData.sortOrder,
      };
      if (editingDept) {
        await departmentApi.update(editingDept.id, body);
        toast.success('部门已更新');
      } else {
        await departmentApi.create(body);
        toast.success('部门已创建');
      }
      setDialogOpen(false);
      setEditingDept(null);
      setFormData({ name: '', parentId: '', headId: '', sortOrder: 0 });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    } catch (err: unknown) {
      handleApiError(err);
    }
  };

  const handleEdit = (dept: DepartmentItem): void => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      parentId: dept.parentId || '',
      headId: dept.headId || '',
      sortOrder: dept.sortOrder,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (dept: DepartmentItem): Promise<void> => {
    const ok = await showConfirm(
      `确定删除「${dept.name}」？有子部门或员工时无法删除。`,
    );
    if (!ok) return;
    try {
      await departmentApi.remove(dept.id);
      toast.success('部门已删除');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    } catch (err: unknown) {
      if (isApiNotFound(err)) {
        toast.warning('该部门已不存在或已被删除');
        queryClient.invalidateQueries({ queryKey: ['departments'] });
        return;
      }
      handleApiError(err);
    }
  };

  const toggleExpand = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTreeNode = (
    node: DepartmentTreeNode,
    depth: number = 0,
  ): React.ReactNode => {
    const isOpen = expanded.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const hasRowActions = canEdit || canDelete || canCreate;
    return (
      <React.Fragment key={node.id}>
        <TableRow className="group relative">
          <TableCell className="py-2 px-3">
            <div
              className="flex items-center gap-1.5"
              style={{ paddingLeft: depth * 18 }}
            >
              {hasChildren ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 shrink-0"
                  onClick={() => toggleExpand(node.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </Button>
              ) : (
                <span className="w-5 shrink-0" />
              )}
              <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium">{node.name}</span>
            </div>
          </TableCell>
          <TableCell className="py-2 px-3 text-muted-foreground">
            {node.parentName || '-'}
          </TableCell>
          <TableCell className="py-2 px-3">
            {canViewEmployees ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary p-0 h-auto text-xs"
                onClick={() => {
                  setMembersDeptName(node.name);
                  setMembersDialogOpen(true);
                }}
              >
                <Users className="size-3" />
                {node.memberCount}
              </Button>
            ) : (
              <span className="text-muted-foreground">{node.memberCount}</span>
            )}
          </TableCell>
          <TableCell className="py-2 px-3 text-right">
            {node.headId ? (
              <UserDisplay
                value={{ user_id: node.headId, name: node.headName }}
                size="small"
                showLabel={false}
              />
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {/* 悬浮菜单：覆盖右侧一半区域（图标徽章） */}
            {hasRowActions && (
              <div className="pointer-events-none absolute inset-y-0 right-0 z-20 flex w-1/2 items-center justify-end gap-1 border-l border-border/60 bg-background/95 px-4 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                <CanDo {...COMMAND_PERMISSIONS.departmentEdit}>
                  <span title="编辑" onClick={(e) => e.stopPropagation()}>
                    <ActionBadge
                      actionType="edit"
                      icon={<Pencil className="size-3" />}
                      label=""
                      onClick={() => handleEdit(node)}
                      className="h-6 w-6 p-0"
                    />
                  </span>
                </CanDo>
                {canCreate && (
                  <span
                    title="添加子部门"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ActionBadge
                      actionType="bind"
                      icon={<Plus className="size-3" />}
                      label=""
                      onClick={() => {
                        setEditingDept(null);
                        setFormData({
                          name: '',
                          parentId: node.id,
                          headId: '',
                          sortOrder: 0,
                        });
                        setDialogOpen(true);
                      }}
                      className="h-6 w-6 p-0"
                    />
                  </span>
                )}
                <CanDo {...COMMAND_PERMISSIONS.departmentDelete}>
                  <span title="删除" onClick={(e) => e.stopPropagation()}>
                    <ActionBadge
                      actionType="delete"
                      icon={<Trash2 className="size-3" />}
                      label=""
                      onClick={() => handleDelete(node)}
                      className="h-6 w-6 p-0"
                    />
                  </span>
                </CanDo>
              </div>
            )}
          </TableCell>
        </TableRow>
        {isOpen &&
          hasChildren &&
          node.children.map((child) => renderTreeNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div />
        <Dialog
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) setEditingDept(null);
          }}
        >
          {canCreate && (
            <DialogTrigger asChild>
              <Button
                onClick={() => {
                  setEditingDept(null);
                  setFormData({
                    name: '',
                    parentId: '',
                    headId: '',
                    sortOrder: 0,
                  });
                }}
              >
                <Plus data-icon="inline-start" />
                新建部门
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="w-[95vw] sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingDept ? '编辑部门' : '新建部门'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label>部门名称 *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>上级部门</Label>
                <Select
                  value={formData.parentId || '__none'}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      parentId: v === '__none' ? '' : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="无（一级部门）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">无（一级部门）</SelectItem>
                    {renderTreeOptions(tree, editingDept?.id)}
                  </SelectContent>
                </Select>
              </div>
              {canManageHead && (
                <div>
                  <Label>部门负责人</Label>
                  <UserSelect
                    value={formData.headId || null}
                    onChange={(v: string | null) =>
                      setFormData({ ...formData, headId: v || '' })
                    }
                    placeholder="请选择负责人"
                  />
                </div>
              )}
              <div>
                <Label>排序</Label>
                <Input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sortOrder: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <CanDo {...COMMAND_PERMISSIONS.departmentEdit}>
                <Button onClick={handleSave}>
                  {editingDept ? '保存' : '创建'}
                </Button>
              </CanDo>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Building2 className="size-4 sm:size-5 text-muted-foreground" />
            组织架构
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner className="size-6" />
            </div>
          ) : tree.length === 0 ? (
            <div className="py-12">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Building2 className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>暂无部门数据</EmptyTitle>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="h-8 px-3 text-xs">部门名称</TableHead>
                    <TableHead className="h-8 px-3 text-xs">上级部门</TableHead>
                    <TableHead className="h-8 px-3 text-xs">成员</TableHead>
                    <TableHead className="h-8 px-3 text-right text-xs">
                      负责人
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tree.map((node) => renderTreeNode(node))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      <DepartmentMembersDialog
        open={membersDialogOpen}
        onOpenChange={setMembersDialogOpen}
        departmentName={membersDeptName}
      />
    </div>
  );
};

export default DepartmentManagementTab;
