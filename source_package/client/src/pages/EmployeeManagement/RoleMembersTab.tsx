import React, { useState, useEffect, useCallback } from 'react';
import { roleManager } from '@/api';
import type {
  ForceRoleDTO,
  RoleMemberDTO,
  MemberMutationData,
} from '@shared/api.interface';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { UserDisplay } from '@/components/business-ui/user-display';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { toast } from 'sonner';
import { UserPlus, UserX, Building2, Users } from 'lucide-react';
import { i18nText } from './role-utils';
import AddMemberDialog from './AddMemberDialog';

interface RoleMembersTabProps {
  role: ForceRoleDTO;
  onMembersChange?: () => void;
}

const memberKey = (type: string, id: string) => `${type}:${id}`;

const splitKey = (key: string): [string, string] => {
  const idx = key.indexOf(':');
  return [key.slice(0, idx), key.slice(idx + 1)];
};

const buildRemovePayload = (keys: Set<string>): MemberMutationData => {
  const payload: MemberMutationData = {};
  const userIds: string[] = [];
  const deptIds: string[] = [];
  const chatIds: string[] = [];
  keys.forEach((key) => {
    const [type, id] = splitKey(key);
    if (type === 'user') userIds.push(id);
    else if (type === 'dept') deptIds.push(id);
    else if (type === 'chat') chatIds.push(id);
  });
  if (userIds.length) payload.userList = userIds.map((id) => ({ userID: id }));
  if (deptIds.length) payload.departmentList = deptIds.map((id) => ({ id }));
  if (chatIds.length) payload.groupChatList = chatIds.map((id) => ({ chatID: id }));
  return payload;
};

const MemberGroup: React.FC<{
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}> = ({ title, icon, count, children }) => (
  <div>
    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {icon} {title} <span className="text-muted-foreground/70">({count})</span>
    </div>
    <div className="flex flex-col gap-1">{children}</div>
  </div>
);

interface MemberRowProps {
  selected: boolean;
  onToggle: () => void;
  onRemove: () => void;
  removing: boolean;
  content: React.ReactNode;
}

const MemberRow: React.FC<MemberRowProps> = ({
  selected,
  onToggle,
  onRemove,
  removing,
  content,
}) => (
  <div
    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
      selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
    }`}
  >
    <Checkbox checked={selected} onCheckedChange={onToggle} />
    {content}
    <CanRole roles={['admin']}>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        title="移除成员"
        disabled={removing}
        onClick={onRemove}
      >
        <UserX className="h-3.5 w-3.5" />
      </Button>
    </CanRole>
  </div>
);

const RoleMembersTab: React.FC<RoleMembersTabProps> = ({ role, onMembersChange }) => {
  const [memberData, setMemberData] = useState<RoleMemberDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const fetchMembers = useCallback(async (bizID: string) => {
    setLoading(true);
    try {
      const res = await roleManager.listMembers(bizID);
      setMemberData(res.members ?? null);
    } catch {
      toast.error('获取成员列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelected(new Set());
    if (role.bizID) fetchMembers(role.bizID);
  }, [role.bizID, fetchMembers]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleRemove = async (keys: Set<string>) => {
    if (keys.size === 0 || !role.bizID) return;
    setRemoving(true);
    try {
      await roleManager.removeMembers(role.bizID, { members: buildRemovePayload(keys) });
      toast.success(`已移除 ${keys.size} 个成员`);
      setSelected(new Set());
      await fetchMembers(role.bizID);
      onMembersChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '移除失败');
    } finally {
      setRemoving(false);
    }
  };

  const users = memberData?.userList ?? [];
  const depts = memberData?.departmentList ?? [];
  const chats = memberData?.groupChatList ?? [];
  const total = users.length + depts.length + chats.length;

  if (loading) {
    return (
      <div className="flex-1 flex flex-col gap-2 overflow-auto p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">成员管理</span>
          <Badge variant="secondary">{total}</Badge>
          {memberData?.allEmployees && <Badge>企业全员</Badge>}
          {memberData?.public && <Badge variant="outline">互联网公开</Badge>}
        </div>
        <div className="flex gap-2">
          <CanRole roles={['admin']}>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0 || removing}
              onClick={() => handleRemove(selected)}
            >
              <UserX className="mr-1 size-4" /> 批量移除
              {selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
          </CanRole>
          <CanRole roles={['admin']}>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-1 size-4" /> 添加成员
            </Button>
          </CanRole>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {total === 0 ? (
          <div className="p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users className="size-6" />
                </EmptyMedia>
                <EmptyTitle>暂无成员</EmptyTitle>
                <EmptyDescription>
                  点击“添加成员”为该角色添加用户、部门或群组
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {users.length > 0 && (
              <MemberGroup title="用户" icon={<UserPlus className="size-4" />} count={users.length}>
                {users.map((u) => {
                  const id = u.userID ?? '';
                  const key = memberKey('user', id);
                  return (
                    <MemberRow
                      key={key}
                      selected={selected.has(key)}
                      onToggle={() => toggleSelect(key)}
                      onRemove={() => handleRemove(new Set([key]))}
                      removing={removing}
                      content={
                        <div className="flex flex-1 items-center gap-3">
                          {id ? (
                            <UserDisplay value={id} size="small" />
                          ) : (
                            <span className="text-sm">{i18nText(u.name) || '未知用户'}</span>
                          )}
                          {u.department?.name ? (
                            <span className="text-xs text-muted-foreground">
                              {i18nText(u.department.name)}
                            </span>
                          ) : null}
                        </div>
                      }
                    />
                  );
                })}
              </MemberGroup>
            )}
            {depts.length > 0 && (
              <MemberGroup title="部门" icon={<Building2 className="size-4" />} count={depts.length}>
                {depts.map((d) => {
                  const id = String(d.id ?? '');
                  const key = memberKey('dept', id);
                  return (
                    <MemberRow
                      key={key}
                      selected={selected.has(key)}
                      onToggle={() => toggleSelect(key)}
                      onRemove={() => handleRemove(new Set([key]))}
                      removing={removing}
                      content={
                        <div className="flex flex-1 items-center gap-2">
                          <Building2 className="size-4 text-muted-foreground" />
                          <span className="text-sm">{i18nText(d.name) || id || '未知部门'}</span>
                        </div>
                      }
                    />
                  );
                })}
              </MemberGroup>
            )}
            {chats.length > 0 && (
              <MemberGroup title="群组" icon={<Users className="size-4" />} count={chats.length}>
                {chats.map((c) => {
                  const id = String(c.chatID ?? '');
                  const key = memberKey('chat', id);
                  return (
                    <MemberRow
                      key={key}
                      selected={selected.has(key)}
                      onToggle={() => toggleSelect(key)}
                      onRemove={() => handleRemove(new Set([key]))}
                      removing={removing}
                      content={
                        <div className="flex flex-1 items-center gap-2">
                          <Users className="size-4 text-muted-foreground" />
                          <span className="text-sm">{i18nText(c.name) || id || '未知群组'}</span>
                        </div>
                      }
                    />
                  );
                })}
              </MemberGroup>
            )}
          </div>
        )}
      </div>

      <AddMemberDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        bizID={role.bizID ?? ''}
        existingUserIds={users.map((u) => u.userID ?? '')}
        existingDeptIds={depts.map((d) => String(d.id ?? ''))}
        existingChatIds={chats.map((c) => String(c.chatID ?? ''))}
        onAdded={() => {
          if (role.bizID) fetchMembers(role.bizID);
          onMembersChange?.();
        }}
      />
    </div>
  );
};

export default RoleMembersTab;
