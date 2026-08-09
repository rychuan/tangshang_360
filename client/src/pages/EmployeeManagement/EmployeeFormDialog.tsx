import React from 'react';
import type {
  EmployeeItem,
  CreateEmployeeRequest,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import DepartmentTreeSelect from '@/components/ui/department-tree-select';
import { UserSelect } from '@/components/business-ui/user-select';
import { UserDisplay } from '@/components/business-ui/user-display';
import { useUsersByIds } from '@/components/business-ui/api/users/queries';

export interface EmployeeFormData {
  userId: string;
  name: string;
  position: string;
  positionCode?: string;
  employeeNo: string;
  title: string;
  role: string[];
  department: string;
  departmentId?: string;
  supervisorId: string;
  phone: string;
}

export const emptyEmployeeForm: EmployeeFormData = {
  userId: '',
  name: '',
  position: '',
  employeeNo: '',
  title: '',
  role: ['employee'],
  department: '',
  supervisorId: '',
  phone: '',
};

export function employeeToForm(emp: EmployeeItem): EmployeeFormData {
  return {
    userId: emp.id,
    name: emp.name,
    position: emp.position,
    positionCode: (emp as any).positionCode,
    employeeNo: emp.employeeNo || '',
    title: emp.title || '',
    role: emp.role ? emp.role.split(',').filter(Boolean) : ['employee'],
    department: emp.department || '',
    departmentId: (emp as any).departmentId,
    supervisorId: emp.supervisorId || '',
    phone: emp.phone || '',
  };
}

export function formToCreateRequest(
  data: EmployeeFormData,
): CreateEmployeeRequest {
  return {
    id: data.userId,
    name: data.name,
    position: data.position,
    employeeNo: data.employeeNo || undefined,
    title: data.title || undefined,
    role: data.role.join(',') as CreateEmployeeRequest['role'],
    departmentId: data.departmentId || undefined,
    positionCode: data.positionCode || undefined,
    supervisorId: data.supervisorId || undefined,
    phone: data.phone || undefined,
  };
}

export interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingEmployee: EmployeeItem | null;
  formData: EmployeeFormData;
  setFormData: React.Dispatch<React.SetStateAction<EmployeeFormData>>;
  onSave: () => void;
  submitting?: boolean;
  positions?: string[];
  canManageRoles: boolean;
}

const EmployeeFormDialog: React.FC<EmployeeFormDialogProps> = ({
  open,
  onOpenChange,
  editingEmployee,
  formData,
  setFormData,
  onSave,
  submitting = false,
  positions: positionNames = [],
  canManageRoles,
}) => {
  const isEditing = !!editingEmployee;
  const { data: usersResponse } = useUsersByIds(
    !isEditing && formData.userId ? [formData.userId] : [],
  );

  const positions: { id?: string; name: string }[] = React.useMemo(
    () => positionNames.map((n) => ({ name: n })),
    [positionNames],
  );

  React.useEffect(() => {
    if (isEditing || !formData.userId) return;
    const userInfo = usersResponse?.data?.userInfoMap?.[formData.userId];
    const userName = userInfo?.name?.zh_cn || userInfo?.name?.en_us;
    if (userName && formData.name !== userName) {
      setFormData((prev) => ({ ...prev, name: userName }));
    }
  }, [usersResponse, formData.userId, formData.name, isEditing, setFormData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{editingEmployee ? '编辑员工' : '新建员工'}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="employee-user"
              className="text-xs text-muted-foreground"
            >
              关联用户 *
            </Label>
            {isEditing ? (
              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3">
                <UserDisplay
                  value={{
                    user_id: editingEmployee.id,
                    name: editingEmployee.name,
                  }}
                  size="small"
                />
              </div>
            ) : (
              <UserSelect
                value={formData.userId || null}
                onChange={(v) =>
                  setFormData({ ...formData, userId: v ?? '', name: '' })
                }
                placeholder="请选择飞书用户"
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">姓名 *</Label>
              <Input
                value={formData.name}
                readOnly
                className="bg-muted"
                placeholder="选择用户后自动填充"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">岗位 *</Label>
              <Select
                value={formData.position}
                onValueChange={(v) => setFormData({ ...formData, position: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择岗位" />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((p) => (
                    <SelectItem key={p.name} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">员工编号</Label>
              <Input
                value={formData.employeeNo}
                onChange={(e) =>
                  setFormData({ ...formData, employeeNo: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">职级</Label>
              <Input
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="P5/M1"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {canManageRoles && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">角色</Label>
                <div className="flex flex-col gap-1.5 rounded-md border border-input px-3 py-2">
                  {(
                    [
                      'employee',
                      'supervisor',
                      'dept_head',
                      'hrd',
                      'admin',
                    ] as const
                  ).map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={formData.role.includes(r)}
                        disabled={r === 'employee' || r === 'dept_head'}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormData({
                              ...formData,
                              role: [...formData.role, r],
                            });
                          } else {
                            setFormData({
                              ...formData,
                              role: formData.role.filter((x) => x !== r),
                            });
                          }
                        }}
                      />
                      {r === 'admin'
                        ? '管理员'
                        : r === 'hrd'
                          ? 'HRD'
                          : r === 'dept_head'
                            ? '部门负责人'
                            : r === 'supervisor'
                              ? '上级'
                              : '员工'}
                      {r === 'employee' && (
                        <span className="text-xs text-muted-foreground">
                          （必选）
                        </span>
                      )}
                      {r === 'dept_head' && (
                        <span className="text-xs text-muted-foreground">
                          （由部门负责人指派自动授予）
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">部门</Label>
              <DepartmentTreeSelect
                value={formData.department}
                onChange={(name, id) =>
                  setFormData({ ...formData, department: name, departmentId: id })
                }
                placeholder="选择部门"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">上级</Label>
              <UserSelect
                value={formData.supervisorId || null}
                onChange={(v) =>
                  setFormData({ ...formData, supervisorId: v ?? '' })
                }
                placeholder="不指定则由部门负责人自动填充"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">手机号</Label>
              <Input
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button onClick={onSave} disabled={submitting}>
            {submitting && <Spinner className="mr-2 size-4" />}
            {editingEmployee ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeFormDialog;
