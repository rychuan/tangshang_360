import React, { useState, useCallback } from 'react';
import { roleManager } from '@/api';
import type { SearchResult, MemberMutationData } from '@shared/api.interface';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Search, User, Building2, Users } from 'lucide-react';
import { i18nText } from './role-utils';

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bizID: string;
  existingUserIds: string[];
  existingDeptIds: string[];
  existingChatIds: string[];
  onAdded: () => void;
}

const MemberSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <div>
    <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
      {icon} {title}
    </div>
    <div className="flex flex-col gap-0.5">{children}</div>
  </div>
);

interface MemberOptionProps {
  checked: boolean;
  disabled: boolean;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  tag?: string;
  onToggle: () => void;
}

const MemberOption: React.FC<MemberOptionProps> = ({
  checked,
  disabled,
  label,
  sub,
  icon,
  tag,
  onToggle,
}) => (
  <div
    className={`flex items-center gap-3 rounded-md px-2 py-2 transition-colors ${
      disabled ? 'opacity-50' : 'hover:bg-muted/50'
    }`}
  >
    <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} />
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-medium">{label}</div>
      {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
    </div>
    {tag ? (
      <Badge variant="secondary" className="shrink-0">
        {tag}
      </Badge>
    ) : null}
  </div>
);

const AddMemberDialog: React.FC<AddMemberDialogProps> = ({
  open,
  onOpenChange,
  bizID,
  existingUserIds,
  existingDeptIds,
  existingChatIds,
  onAdded,
}) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set());
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setQuery('');
    setResult(null);
    setSelectedUsers(new Set());
    setSelectedDepts(new Set());
    setSelectedChats(new Set());
  };

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await roleManager.searchMembers({ query: query.trim(), pageSize: 30 });
      setResult(res.result ?? null);
    } catch {
      toast.error('搜索失败');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const toggle = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSelected = selectedUsers.size + selectedDepts.size + selectedChats.size;

  const handleAdd = async () => {
    if (!bizID) return;
    if (totalSelected === 0) {
      toast.error('请至少选择一个成员');
      return;
    }
    const members: MemberMutationData = {};
    if (selectedUsers.size > 0) {
      members.userList = Array.from(selectedUsers).map((id) => ({ userID: id }));
    }
    if (selectedDepts.size > 0) {
      members.departmentList = Array.from(selectedDepts).map((id) => ({ id }));
    }
    if (selectedChats.size > 0) {
      members.groupChatList = Array.from(selectedChats).map((id) => ({ chatID: id }));
    }
    setSubmitting(true);
    try {
      await roleManager.addMembers(bizID, { members });
      toast.success(`已添加 ${totalSelected} 个成员`);
      reset();
      onAdded();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const users = result?.userResult?.items ?? [];
  const depts = result?.departmentResult?.items ?? [];
  const chats = result?.chatResult?.items ?? [];
  const hasResult = users.length + depts.length + chats.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加成员</DialogTitle>
          <DialogDescription>
            搜索并添加用户、部门或群组到当前角色。
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
            placeholder="输入姓名、部门或群组名称搜索"
          />
          <Button onClick={handleSearch} disabled={searching || !query.trim()}>
            <Search className="mr-1 size-4" /> 搜索
          </Button>
        </div>
        <div className="h-[340px] overflow-auto rounded-lg border">
          {searching ? (
            <div className="flex flex-col gap-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !result ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              请输入关键词搜索成员
            </div>
          ) : !hasResult ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              未找到相关结果
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-2">
              {users.length > 0 && (
                <MemberSection title="用户" icon={<User className="size-4" />}>
                  {users.map((u) => {
                    const id = u.userID ?? '';
                    const already = existingUserIds.includes(id);
                    return (
                      <MemberOption
                        key={`u-${id}`}
                        checked={selectedUsers.has(id)}
                        disabled={already || !id}
                        label={i18nText(u.name) || id || '未知用户'}
                        sub={u.department?.name ? i18nText(u.department.name) : u.email || ''}
                        icon={<User className="size-4" />}
                        tag={already ? '已添加' : undefined}
                        onToggle={() => toggle(id, setSelectedUsers)}
                      />
                    );
                  })}
                </MemberSection>
              )}
              {depts.length > 0 && (
                <MemberSection title="部门" icon={<Building2 className="size-4" />}>
                  {depts.map((d) => {
                    const id = String(d.departmentID ?? '');
                    const already = existingDeptIds.includes(id);
                    return (
                      <MemberOption
                        key={`d-${id}`}
                        checked={selectedDepts.has(id)}
                        disabled={already || !id}
                        label={i18nText(d.name) || id || '未知部门'}
                        icon={<Building2 className="size-4" />}
                        tag={already ? '已添加' : undefined}
                        onToggle={() => toggle(id, setSelectedDepts)}
                      />
                    );
                  })}
                </MemberSection>
              )}
              {chats.length > 0 && (
                <MemberSection title="群组" icon={<Users className="size-4" />}>
                  {chats.map((c) => {
                    const id = String(c.chatID ?? '');
                    const already = existingChatIds.includes(id);
                    return (
                      <MemberOption
                        key={`c-${id}`}
                        checked={selectedChats.has(id)}
                        disabled={already || !id}
                        label={i18nText(c.name) || id || '未知群组'}
                        sub={c.userCount != null ? `${c.userCount} 人` : ''}
                        icon={<Users className="size-4" />}
                        tag={already ? '已添加' : undefined}
                        onToggle={() => toggle(id, setSelectedChats)}
                      />
                    );
                  })}
                </MemberSection>
              )}
            </div>
          )}
        </div>
        <DialogFooter className="items-center justify-between sm:justify-between">
          <span className="text-sm text-muted-foreground">已选 {totalSelected} 项</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={submitting || totalSelected === 0}>
              {submitting ? '添加中...' : '添加选中'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddMemberDialog;
