import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type {
  BitableConnectionItem,
  CreateBitableConnectionRequest,
} from '@shared/api.interface';

interface BitableConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: BitableConnectionItem | null;
  onSave: (data: CreateBitableConnectionRequest) => Promise<void>;
}

const emptyForm: CreateBitableConnectionRequest = {
  name: '',
  appId: '',
  appSecret: '',
  bitableAppToken: '',
  tableId: '',
};

function BitableConnectionDialog({
  open,
  onOpenChange,
  editing,
  onSave,
}: BitableConnectionDialogProps) {
  const [form, setForm] = useState<CreateBitableConnectionRequest>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        appId: '',
        appSecret: '',
        bitableAppToken: editing.bitableAppToken,
        tableId: editing.tableId,
      });
    } else {
      setForm(emptyForm);
    }
  }, [editing, open]);

  const handleSave = async () => {
    if (
      !form.name ||
      (!editing && (!form.appId || !form.appSecret)) ||
      !form.bitableAppToken ||
      !form.tableId
    ) {
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? '编辑连接' : '新建连接'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label>连接名称</Label>
            <Input
              placeholder="如：研发部员工表"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>飞书 App ID</Label>
            <Input
              placeholder="cli_xxxxxxxx"
              value={form.appId}
              onChange={(e) => setForm({ ...form, appId: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>飞书 App Secret</Label>
            <Input
              type="password"
              placeholder={editing ? '留空则不修改' : '输入 App Secret'}
              value={form.appSecret}
              onChange={(e) => setForm({ ...form, appSecret: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>多维表格 App Token</Label>
            <Input
              placeholder="bascnxxxxxxxx"
              value={form.bitableAppToken}
              onChange={(e) =>
                setForm({
                  ...form,
                  bitableAppToken: e.target.value,
                })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>子表 ID</Label>
            <Input
              placeholder="tblxxxxxxxx"
              value={form.tableId}
              onChange={(e) => setForm({ ...form, tableId: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Spinner className="mr-2 size-4" />}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BitableConnectionDialog;
