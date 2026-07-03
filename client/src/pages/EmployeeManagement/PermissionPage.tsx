import React, { useState, useEffect, useCallback } from 'react';
import { roleManager } from '@/api';
import type { ForceRoleDTO } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { PageHeader } from '@/components/business-ui/page-header';
import { toast } from 'sonner';
import { handleApiError } from '@client/src/utils/api-error';
import { Shield, Lock, Users, ShieldCheck } from 'lucide-react';
import RoleListPanel from './RoleListPanel';
import { getRoleMemberCount } from './role-utils';
import PermissionMatrixTab from './PermissionMatrixTab';
import RoleMembersTab from './RoleMembersTab';
import RoleFormDialog from './RoleFormDialog';

const PermissionPage: React.FC = () => {
  const [roles, setRoles] = useState<ForceRoleDTO[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<ForceRoleDTO | null>(null);
  const [activeTab, setActiveTab] = useState('permissions');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingRole, setEditingRole] = useState<ForceRoleDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ForceRoleDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshRoles = useCallback(async (selectBizID?: string) => {
    try {
      const data = await roleManager.listRoles();
      setRoles(data);
      setSelectedRole((prev) => {
        if (selectBizID) {
          const found = data.find((r) => r.bizID === selectBizID);
          if (found) return found;
        }
        if (prev && data.find((r) => r.bizID === prev.bizID)) {
          return data.find((r) => r.bizID === prev.bizID) ?? prev;
        }
        return data[0] ?? null;
      });
    } catch (err) {
      handleApiError(err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setRolesLoading(true);
      await refreshRoles();
      setRolesLoading(false);
    })();
  }, [refreshRoles]);

  const handleCreateClick = () => {
    setFormMode('create');
    setEditingRole(null);
    setFormOpen(true);
  };

  const handleEditClick = (role: ForceRoleDTO) => {
    setFormMode('edit');
    setEditingRole(role);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    if (formMode === 'edit' && editingRole?.bizID) {
      refreshRoles(editingRole.bizID);
    } else {
      refreshRoles();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget?.bizID) return;
    setDeleting(true);
    try {
      await roleManager.deleteRole(deleteTarget.bizID);
      toast.success('角色已删除');
      setDeleteTarget(null);
      await refreshRoles();
    } catch (err) {
      handleApiError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-[calc(100svh-6.5rem)] min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <PageHeader
          title="权限管理"
          icon={Shield}
          description="基于角色配置功能权限与成员归属。"
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <aside className="w-[30%] min-w-[260px] overflow-hidden rounded-lg border">
          <RoleListPanel
            roles={roles}
            loading={rolesLoading}
            selectedBizID={selectedRole?.bizID ?? null}
            onSelectRole={setSelectedRole}
            onCreateClick={handleCreateClick}
            onEditClick={handleEditClick}
            onDeleteClick={(r) => setDeleteTarget(r)}
          />
        </aside>

        <section className="min-w-0 flex-1 overflow-hidden rounded-lg border">
          {selectedRole ? (
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full"
            >
              <div className="px-3 pt-3">
                <TabsList>
                  <TabsTrigger value="permissions">
                    <Lock /> 权限配置
                  </TabsTrigger>
                  <TabsTrigger value="members">
                    <Users /> 成员管理(
                    {getRoleMemberCount(selectedRole)})
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="permissions"
                className="mt-0 flex min-h-0 flex-1 flex-col"
              >
                <PermissionMatrixTab role={selectedRole} />
              </TabsContent>
              <TabsContent
                value="members"
                className="mt-0 flex min-h-0 flex-1 flex-col"
              >
                <RoleMembersTab
                  role={selectedRole}
                  onMembersChange={() => refreshRoles(selectedRole.bizID)}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShieldCheck className="size-6" />
                  </EmptyMedia>
                  <EmptyTitle>请选择角色</EmptyTitle>
                  <EmptyDescription>
                    从左侧选择一个角色，查看并配置其权限与成员。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )}
        </section>
      </div>

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        role={editingRole}
        onSuccess={handleFormSuccess}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除角色</DialogTitle>
            <DialogDescription>
              确认删除角色「{deleteTarget?.name || deleteTarget?.bizID}
              」？此操作不可恢复，关联的权限配置也将被清除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PermissionPage;
