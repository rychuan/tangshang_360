import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { roleManager } from '@/api';
import type {
  PermissionItem,
  PermissionResource,
  PermissionAction,
  ForceRoleDTO,
} from '@shared/api.interface';
import { DEFAULT_PERMISSIONS, PERMISSION_MATRIX } from '@shared/api.interface';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { CanDo } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { handleApiError } from '@client/src/utils/api-error';
import { Save, RotateCcw } from '@/components/ui/hugeicons';

interface PermissionMatrixTabProps {
  role: ForceRoleDTO;
}

const RESOURCE_LABELS: Record<PermissionResource, string> = {
  dashboard: '工作台',
  my_assessments: '我的绩效',
  employees: '员工管理',
  template_management: '模板管理',
  employee_binding: '员工模板绑定',
  publish_management: '发布管理',
  statistics: '统计查询',
  team_performance: '团队绩效',
  organization: '组织架构',
  permission_management: '权限管理',
  grade_config: '等级配置',
  dictionary_config: '字段管理',
};

const ACTION_LABELS: Record<PermissionAction, string> = {
  view: '查看',
  edit: '编辑',
  delete: '删除',
  export: '导出',
  publish: '发布',
};

const ALL_ACTIONS: PermissionAction[] = [
  'view',
  'edit',
  'delete',
  'export',
  'publish',
];

const RESOURCE_ORDER = Object.keys(RESOURCE_LABELS) as PermissionResource[];

const clonePermissions = (items: PermissionItem[]): PermissionItem[] =>
  items.map((p) => ({ resource: p.resource, actions: [...p.actions] }));

const PermissionMatrixTab: React.FC<PermissionMatrixTabProps> = ({ role }) => {
  const queryClient = useQueryClient();

  const { data: permissions = [], isLoading: loading } = useQuery({
    queryKey: ['roles', 'permissions', role.bizID],
    queryFn: () =>
      roleManager
        .getRolePermissions(role.bizID)
        .then((config) => clonePermissions(config.permissions || [])),
    enabled: !!role.bizID,
  });

  const [saving, setSaving] = useState(false);

  const hasAction = (resource: PermissionResource, action: PermissionAction) =>
    permissions
      .find((p) => p.resource === resource)
      ?.actions.includes(action) ?? false;

  const toggleAction = (
    resource: PermissionResource,
    action: PermissionAction,
  ) => {
    queryClient.setQueryData(
      ['roles', 'permissions', role.bizID],
      (prev: PermissionItem[]) => {
        const copy = clonePermissions(prev);
        const existing = copy.find((p) => p.resource === resource);
        if (!existing) {
          if (action === 'view') copy.push({ resource, actions: ['view'] });
          return copy;
        }
        if (existing.actions.includes(action)) {
          existing.actions = existing.actions.filter((a) => a !== action);
          if (existing.actions.length === 0) {
            return copy.filter((p) => p.resource !== resource);
          }
          // 取消「查看」时自动移除所有其他权限，防止保存为 edit 不含 view 的不一致状态
          if (action === 'view') {
            existing.actions = [];
            return copy.filter((p) => p.resource !== resource);
          }
        } else {
          existing.actions.push(action);
          if (action !== 'view' && !existing.actions.includes('view')) {
            existing.actions.unshift('view');
          }
        }
        return copy;
      },
    );
  };

  const handleSave = async () => {
    if (!role.bizID) return;
    setSaving(true);
    try {
      await roleManager.updateRolePermissions(role.bizID, { permissions });
      toast.success('权限配置已保存');
    } catch (err) {
      handleApiError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const preset = (DEFAULT_PERMISSIONS as Record<string, PermissionItem[]>)[
      role.bizID ?? ''
    ];
    if (preset) {
      queryClient.setQueryData(
        ['roles', 'permissions', role.bizID],
        clonePermissions(preset),
      );
      toast.info('已重置为预设权限，点击保存生效');
    } else {
      toast('当前角色无预设权限');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col gap-2 overflow-auto p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto p-4">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 bg-background w-[200px]">
                  资源 / 页面
                </TableHead>
                {ALL_ACTIONS.map((a) => (
                  <TableHead key={a} className="w-[90px] text-center">
                    {ACTION_LABELS[a]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {RESOURCE_ORDER.map((resource) => {
                const validActions = PERMISSION_MATRIX[resource];
                return (
                  <TableRow key={resource}>
                    <TableCell className="sticky left-0 z-10 bg-background font-medium">
                      {RESOURCE_LABELS[resource]}
                    </TableCell>
                    {ALL_ACTIONS.map((action) => {
                      if (!validActions.includes(action)) {
                        return (
                          <TableCell
                            key={action}
                            className="text-center text-muted-foreground"
                          >
                            —
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={action} className="text-center">
                          <Checkbox
                            checked={hasAction(resource, action)}
                            onCheckedChange={() =>
                              toggleAction(resource, action)
                            }
                          />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          勾选后点击保存生效。授权「编辑/删除/导出/发布」时将自动包含「查看」。
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw data-icon="inline-start" /> 重置为预设
          </Button>
          <CanRole roles={['admin']}>
            <CanDo resource="permission_management" action="edit">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save data-icon="inline-start" />{' '}
                {saving ? '保存中...' : '保存'}
              </Button>
            </CanDo>
          </CanRole>
        </div>
      </div>
    </div>
  );
};

export default PermissionMatrixTab;
