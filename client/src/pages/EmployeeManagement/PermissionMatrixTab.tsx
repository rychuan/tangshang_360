import React, { useState, useEffect, useCallback } from 'react';
import { roleManager } from '@/api';
import type {
  PermissionItem,
  PermissionResource,
  PermissionAction,
  ForceRoleDTO,
} from '@shared/api.interface';
import { DEFAULT_PERMISSIONS } from '@shared/api.interface';
import { CanRole } from '@lark-apaas/client-toolkit/auth';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Save, RotateCcw } from 'lucide-react';

interface PermissionMatrixTabProps {
  role: ForceRoleDTO;
}

const RESOURCE_LABELS: Record<PermissionResource, string> = {
  dashboard: '首页概览',
  my_assessments: '我的绩效',
  employees: '员工管理',
  template_management: '绩效模板管理',
  employee_binding: '员工模板绑定',
  publish_management: '绩效发布管理',
  statistics: '绩效统计查询',
  team_performance: '团队绩效',
  organization: '组织架构',
  permission_management: '权限管理',
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

const PERMISSION_MATRIX: Record<PermissionResource, PermissionAction[]> = {
  dashboard: ['view'],
  my_assessments: ['view', 'edit'],
  employees: ['view', 'edit', 'delete'],
  template_management: ['view', 'edit', 'delete'],
  employee_binding: ['view', 'edit'],
  publish_management: ['view', 'edit', 'publish'],
  statistics: ['view', 'export'],
  team_performance: ['view', 'edit'],
  organization: ['view', 'edit', 'delete'],
  permission_management: ['view', 'edit'],
};

const RESOURCE_ORDER = Object.keys(RESOURCE_LABELS) as PermissionResource[];

const clonePermissions = (items: PermissionItem[]): PermissionItem[] =>
  items.map((p) => ({ resource: p.resource, actions: [...p.actions] }));

const PermissionMatrixTab: React.FC<PermissionMatrixTabProps> = ({ role }) => {
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPermissions = useCallback(async (bizID: string) => {
    setLoading(true);
    try {
      const config = await roleManager.getRolePermissions(bizID);
      setPermissions(clonePermissions(config.permissions || []));
    } catch {
      toast.error('获取权限配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role.bizID) fetchPermissions(role.bizID);
  }, [role.bizID, fetchPermissions]);

  const hasAction = (resource: PermissionResource, action: PermissionAction) =>
    permissions
      .find((p) => p.resource === resource)
      ?.actions.includes(action) ?? false;

  const toggleAction = (
    resource: PermissionResource,
    action: PermissionAction,
  ) => {
    setPermissions((prev) => {
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
      } else {
        existing.actions.push(action);
        if (action !== 'view' && !existing.actions.includes('view')) {
          existing.actions.unshift('view');
        }
      }
      return copy;
    });
  };

  const handleSave = async () => {
    if (!role.bizID) return;
    setSaving(true);
    try {
      await roleManager.updateRolePermissions(role.bizID, { permissions });
      toast.success('权限配置已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const preset = (DEFAULT_PERMISSIONS as Record<string, PermissionItem[]>)[
      role.bizID ?? ''
    ];
    if (preset) {
      setPermissions(clonePermissions(preset));
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b hover:bg-muted/50 transition-colors">
                <th className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap w-[200px]">
                  资源 / 页面
                </th>
                {ALL_ACTIONS.map((a) => (
                  <th
                    key={a}
                    className="text-muted-foreground h-10 px-4 text-left align-middle font-medium whitespace-nowrap w-[90px] text-center"
                  >
                    {ACTION_LABELS[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCE_ORDER.map((resource) => {
                const validActions = PERMISSION_MATRIX[resource];
                return (
                  <tr
                    key={resource}
                    className="border-b hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-3 px-4 align-middle whitespace-nowrap font-medium">
                      {RESOURCE_LABELS[resource]}
                    </td>
                    {ALL_ACTIONS.map((action) => {
                      if (!validActions.includes(action)) {
                        return (
                          <td
                            key={action}
                            className="py-3 px-4 align-middle whitespace-nowrap text-center text-muted-foreground"
                          >
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={action}
                          className="py-3 px-4 align-middle whitespace-nowrap text-center"
                        >
                          <Checkbox
                            checked={hasAction(resource, action)}
                            onCheckedChange={() =>
                              toggleAction(resource, action)
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          勾选后点击保存生效。授权「编辑/删除/导出/发布」时将自动包含「查看」。
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1 size-4" /> 重置为预设
          </Button>
          <CanRole roles={['admin']}>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="mr-1 size-4" /> {saving ? '保存中...' : '保存'}
            </Button>
          </CanRole>
        </div>
      </div>
    </div>
  );
};

export default PermissionMatrixTab;
