import React, { useEffect, useState } from 'react';
import { roleManager } from '@/api';
import type { ForceRoleDTO } from '@shared/api.interface';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  role?: ForceRoleDTO | null;
  onSuccess: () => void;
}

const RoleFormDialog: React.FC<RoleFormDialogProps> = ({
  open,
  onOpenChange,
  mode,
  role,
  onSuccess,
}) => {
  const [name, setName] = useState('');
  const [bizID, setBizID] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(role?.name ?? '');
      setBizID(role?.bizID ?? '');
      setDescription(role?.description ?? '');
    }
  }, [open, role]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('请输入角色名称');
      return;
    }
    if (mode === 'create' && !bizID.trim()) {
      toast.error('请输入角色标识');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'create') {
        await roleManager.createRole({
          role: {
            name: name.trim(),
            bizID: bizID.trim(),
            description: description.trim() || undefined,
          },
        });
        toast.success('角色创建成功');
      } else if (role?.bizID) {
        await roleManager.updateRole(role.bizID, {
          role: {
            name: name.trim(),
            description: description.trim() || undefined,
          },
        });
        toast.success('角色更新成功');
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增角色' : '编辑角色'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? '创建一个新角色，随后可配置其权限与成员。'
              : '修改角色的基本信息。'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="role-name" className="text-xs text-muted-foreground mb-1.5">
              角色名称 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入角色名称"
            />
          </div>
          {mode === 'create' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="role-bizid" className="text-xs text-muted-foreground mb-1.5">
                角色标识 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="role-bizid"
                value={bizID}
                onChange={(e) => setBizID(e.target.value)}
                placeholder="snake_case，如 role_editor"
              />
              <p className="text-xs text-muted-foreground">
                创建后不可修改，需全局唯一。
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="role-desc" className="text-xs text-muted-foreground mb-1.5">角色描述</Label>
            <Textarea
              id="role-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入角色描述（选填）"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RoleFormDialog;
