import React, { useState, useEffect, useCallback } from 'react';
import { department as departmentApi } from '@/api';
import type {
  DepartmentItem,
  DepartmentTreeNode,
  CreateDepartmentRequest,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  Building2,
  Users,
} from 'lucide-react';
import { showConfirm } from '@lark-apaas/client-toolkit';
import DepartmentMembersDialog from './DepartmentMembersDialog';

interface DeptFormData {
  name: string;
  parentId: string;
  headId: string;
  sortOrder: number;
}

const DepartmentManagementTab: React.FC = () => {
  const [items, setItems] = useState<DepartmentItem[]>([]);
  const [tree, setTree] = useState<DepartmentTreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [formData, setFormData] = useState<DeptFormData>({
    name: '',
    parentId: '',
    headId: '',
    sortOrder: 0,
  });

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [membersDeptName, setMembersDeptName] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await departmentApi.list();
      setItems(res.items);
      setTree(res.tree);
      setExpanded(new Set(res.tree.map((n: DepartmentTreeNode) => n.id)));
    } catch {
      toast.error('加载部门数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      loadData();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg || '操作失败');
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
    const ok = await showConfirm(`确定删除「${dept.name}」？有子部门或员工时无法删除。`);
    if (!ok) return;
    try {
      await departmentApi.remove(dept.id);
      toast.success('部门已删除');
      loadData();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg || '删除失败');
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
    return (
      <React.Fragment key={node.id}>
        <tr className="border-b hover:bg-muted/50 transition-colors">
          <td className="py-3 px-4 align-middle whitespace-nowrap">
            <div
              className="flex items-center gap-2"
              style={{ paddingLeft: depth * 20 }}
            >
              {hasChildren ? (
                <button
                  onClick={() => toggleExpand(node.id)}
                  className="p-0.5 hover:bg-muted rounded"
                >
                  {isOpen ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <Building2 className="size-4 text-muted-foreground" />
              <span className="font-medium">{node.name}</span>
            </div>
          </td>
          <td className="py-3 px-4 align-middle whitespace-nowrap text-muted-foreground">
            {node.parentName || '-'}
          </td>
          <td className="py-3 px-4 align-middle whitespace-nowrap text-muted-foreground">
            {node.headName || '-'}
          </td>
          <td className="py-3 px-4 align-middle whitespace-nowrap">
            <button
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              onClick={() => {
                setMembersDeptName(node.name);
                setMembersDialogOpen(true);
              }}
            >
              <Users className="h-3.5 w-3.5" />
              {node.memberCount}
            </button>
          </td>
          <td className="py-3 px-4 align-middle whitespace-nowrap">{node.sortOrder}</td>
          <td className="py-3 px-4 align-middle whitespace-nowrap">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleEdit(node)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(node)}
              >
                <Trash2 className="size-4 text-red-500" />
              </Button>
            </div>
          </td>
        </tr>
        {isOpen &&
          hasChildren &&
          node.children.map((child) => renderTreeNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div />
        <Dialog
          open={dialogOpen}
          onOpenChange={(v) => {
            setDialogOpen(v);
            if (!v) setEditingDept(null);
          }}
        >
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
              <Plus className="mr-2 size-4" />
              新建部门
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingDept ? '编辑部门' : '新建部门'}
              </DialogTitle>
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
                    {items
                      .filter((d) => d.id !== editingDept?.id)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
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
              <Button onClick={handleSave}>
                {editingDept ? '保存' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>组织架构</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">加载中...</p>
          ) : tree.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              暂无部门数据，点击「新建部门」开始
            </p>
          ) : (
            <div className="border rounded-lg overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b hover:bg-muted/50 transition-colors">
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">部门名称</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">上级部门</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">负责人</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">成员</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap">排序</th>
                    <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap w-[100px]">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tree.map((node) => renderTreeNode(node))}
                </tbody>
              </table>
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
