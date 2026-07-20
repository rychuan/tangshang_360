import React from 'react';
import type { ForceRoleDTO } from '@shared/api.interface';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { Plus, Pencil, Trash2, Shield, ChevronRight } from 'lucide-react';
import { getRoleMemberCount, isBuiltinRole } from './role-utils';

interface RoleListPanelProps {
  roles: ForceRoleDTO[];
  loading: boolean;
  selectedBizID: string | null;
  onSelectRole: (role: ForceRoleDTO) => void;
  onOpenMembers: (role: ForceRoleDTO) => void;
  onCreateClick: () => void;
  onEditClick: (role: ForceRoleDTO) => void;
  onDeleteClick: (role: ForceRoleDTO) => void;
}

const RoleListPanel: React.FC<RoleListPanelProps> = ({
  roles,
  loading,
  selectedBizID,
  onSelectRole,
  onOpenMembers,
  onCreateClick,
  onEditClick,
  onDeleteClick,
}) => {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="size-4" /> 角色列表
        </h2>
        <CanRole roles={['admin']}>
          <CanDo resource="permission_management" action="edit">
            <Button size="sm" onClick={onCreateClick}>
              <Plus className="mr-1 size-4" /> 新增角色
            </Button>
          </CanDo>
        </CanRole>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="p-6">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Shield className="size-6" />
                </EmptyMedia>
                <EmptyTitle>暂无角色</EmptyTitle>
                <EmptyDescription>
                  点击右上角“新增角色”创建第一个角色
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {roles.map((role) => {
              const selected = role.bizID === selectedBizID;
              const builtin = isBuiltinRole(role.bizID);
              const count = getRoleMemberCount(role);
              return (
                <div
                  key={role.bizID || String(role.id ?? '')}
                  onClick={() => onSelectRole(role)}
                  className={`group grid cursor-pointer grid-cols-[minmax(0,8fr)_minmax(0,2fr)] overflow-hidden rounded-lg border transition-colors ${
                    selected
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'
                  }`}
                >
                  <div className="relative min-w-0 p-3 pr-16">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {role.name || role.bizID}
                      </span>
                      {builtin && (
                        <Badge variant="secondary" className="shrink-0">
                          内置
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {role.description || '暂无描述'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      成员 {count}
                    </p>

                    <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                      <CanRole roles={['admin']}>
                        <CanDo resource="permission_management" action="edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title="编辑角色"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditClick(role);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </CanDo>
                      </CanRole>
                      <CanRole roles={['admin']}>
                        <CanDo resource="permission_management" action="edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            title={builtin ? '内置角色不可删除' : '删除角色'}
                            disabled={builtin}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteClick(role);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </CanDo>
                      </CanRole>
                    </div>
                  </div>

                  <Button
                    size="icon"
                    className="h-full w-full self-stretch rounded-none"
                    title="成员管理"
                    aria-label={`进入${role.name || role.bizID}的成员管理`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMembers(role);
                    }}
                  >
                    <ChevronRight className="size-5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoleListPanel;
