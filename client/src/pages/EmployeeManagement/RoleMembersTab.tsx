import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { roleManager } from '@/api';
import type {
  ForceRoleDTO,
  RoleMemberDTO,
  MemberMutationData,
  RoleMemberMutationOutcome,
} from '@shared/api.interface';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
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
import { handleApiError } from '@client/src/utils/api-error';
import { UserPlus, UserX, Building2, Users } from '@/components/ui/hugeicons';
import { i18nText } from './role-utils';
import { isBuiltinRole } from '@shared/types/permission.types';
import AddMemberDialog from './AddMemberDialog';
import SyncOutcomeDialog from './SyncOutcomeDialog';
import {
  collectFailedOutcomes,
  extractOutcomesFromError,
} from './role-sync-outcomes';

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
  if (chatIds.length)
    payload.groupChatList = chatIds.map((id) => ({ chatID: id }));
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
  removable?: boolean;
  content: React.ReactNode;
}

const MemberRow: React.FC<MemberRowProps> = ({
  selected,
  onToggle,
  onRemove,
  removing,
  removable = true,
  content,
}) => (
  <div
    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
      selected
        ? 'border-primary bg-primary/5'
        : 'border-border hover:bg-muted/40'
    }`}
  >
    <Checkbox checked={selected} onCheckedChange={onToggle} />
    {content}
    {removable && (
      <CanRole roles={['admin']}>
        <CanDo resource="permission_management" action="edit">
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
        </CanDo>
      </CanRole>
    )}
  </div>
);

const RoleMembersTab: React.FC<RoleMembersTabProps> = ({
  role,
  onMembersChange,
}) => {
  const queryClient = useQueryClient();

  const { data: memberData = null, isLoading: loading } = useQuery({
    queryKey: ['roles', 'members', role.bizID],
    queryFn: () =>
      roleManager
        .listMembers(role.bizID)
        .then((res: { members: RoleMemberDTO | null }) => res.members ?? null),
    enabled: !!role.bizID,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [syncOutcomes, setSyncOutcomes] = useState<
    RoleMemberMutationOutcome[] | null
  >(null);
  const builtin = isBuiltinRole(role.bizID ?? '');

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
      const res = await roleManager.removeMembers(role.bizID, {
        members: buildRemovePayload(keys),
      });
      const failed = collectFailedOutcomes(res);
      if (failed.length > 0) {
        setSelected(new Set());
        setSyncOutcomes(failed);
        return;
      }
      toast.success(`已移除 ${keys.size} 个成员`);
      setSelected(new Set());
      await queryClient.invalidateQueries({
        queryKey: ['roles', 'members', role.bizID],
      });
      onMembersChange?.();
    } catch (err) {
      // 后端对部分失败抛 BadGatewayException，outcomes 在错误响应体里
      const outcomes = extractOutcomesFromError(err);
      if (outcomes && outcomes.length > 0) {
        setSelected(new Set());
        setSyncOutcomes(outcomes);
        return;
      }
      handleApiError(err);
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
          {builtin && (
            <Badge variant="outline">内置角色，成员通过员工管理调整</Badge>
          )}
        </div>
        {!builtin && (
          <div className="flex gap-2">
            <CanRole roles={['admin']}>
              <CanDo resource="permission_management" action="edit">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.size === 0 || removing}
                  onClick={() => handleRemove(selected)}
                >
                  <UserX className="mr-1 size-4" /> 批量移除
                  {selected.size > 0 ? ` (${selected.size})` : ''}
                </Button>
              </CanDo>
            </CanRole>
            <CanRole roles={['admin']}>
              <CanDo resource="permission_management" action="edit">
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <UserPlus className="mr-1 size-4" /> 添加成员
                </Button>
              </CanDo>
            </CanRole>
          </div>
        )}
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
              <MemberGroup
                title="用户"
                icon={<UserPlus className="size-4" />}
                count={users.length}
              >
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
                      removable={!builtin}
                      content={
                        <div className="flex flex-1 items-center gap-3">
                          {id ? (
                            <UserDisplay
                              value={{
                                user_id: id,
                                name: i18nText(u.name) || undefined,
                              }}
                              size="small"
                            />
                          ) : (
                            <span className="text-sm">
                              {i18nText(u.name) || '未知用户'}
                            </span>
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
              <MemberGroup
                title="部门（只读，由平台侧管理）"
                icon={<Building2 className="size-4" />}
                count={depts.length}
              >
                {depts.map((d) => {
                  const id = String(d.id ?? '');
                  return (
                    <MemberRow
                      key={`dept-${id}`}
                      selected={false}
                      onToggle={() => {}}
                      onRemove={() => {}}
                      removing={false}
                      removable={false}
                      content={
                        <div className="flex flex-1 items-center gap-2">
                          <Building2 className="size-4 text-muted-foreground" />
                          <span className="text-sm">
                            {i18nText(d.name) || id || '未知部门'}
                          </span>
                        </div>
                      }
                    />
                  );
                })}
              </MemberGroup>
            )}
            {chats.length > 0 && (
              <MemberGroup
                title="群组（只读，由平台侧管理）"
                icon={<Users className="size-4" />}
                count={chats.length}
              >
                {chats.map((c) => {
                  const id = String(c.chatID ?? '');
                  return (
                    <MemberRow
                      key={`chat-${id}`}
                      selected={false}
                      onToggle={() => {}}
                      onRemove={() => {}}
                      removing={false}
                      removable={false}
                      content={
                        <div className="flex flex-1 items-center gap-2">
                          <Users className="size-4 text-muted-foreground" />
                          <span className="text-sm">
                            {i18nText(c.name) || id || '未知群组'}
                          </span>
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

      {!builtin && (
        <AddMemberDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          bizID={role.bizID ?? ''}
          existingUserIds={users.map((u) => u.userID ?? '')}
          onAdded={() => {
            if (role.bizID)
              queryClient.invalidateQueries({
                queryKey: ['roles', 'members', role.bizID],
              });
            onMembersChange?.();
          }}
          onSyncOutcomes={setSyncOutcomes}
        />
      )}

      <SyncOutcomeDialog
        open={syncOutcomes !== null}
        onOpenChange={(o) => {
          if (!o) setSyncOutcomes(null);
        }}
        outcomes={syncOutcomes ?? []}
        onAllResolved={() => {
          if (role.bizID)
            queryClient.invalidateQueries({
              queryKey: ['roles', 'members', role.bizID],
            });
          onMembersChange?.();
        }}
      />
    </div>
  );
};

export default RoleMembersTab;
