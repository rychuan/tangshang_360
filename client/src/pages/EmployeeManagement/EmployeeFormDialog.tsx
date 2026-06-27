import React from 'react';
import type {
  EmployeeItem,
  CreateEmployeeRequest,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  employeeNo: string;
  title: string;
  role: string;
  department: string;
  supervisorId: string;
  phone: string;
}

export const emptyEmployeeForm: EmployeeFormData = {
  userId: '',
  name: '',
  position: '',
  employeeNo: '',
  title: '',
  role: 'employee',
  department: '',
  supervisorId: '',
  phone: '',
};

export function employeeToForm(emp: EmployeeItem): EmployeeFormData {
  return {
    userId: emp.id,
    name: emp.name,
    position: emp.position,
    employeeNo: emp.employeeNo || '',
    title: emp.title || '',
    role: emp.role || 'employee',
    department: emp.department || '',
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
    role: data.role as CreateEmployeeRequest['role'],
    department: data.department || undefined,
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
}

const EmployeeFormDialog: React.FC<EmployeeFormDialogProps> = ({
  open,
  onOpenChange,
  editingEmployee,
  formData,
  setFormData,
  onSave,
}) => {
  const isEditing = !!editingEmployee;
  const { data: usersResponse } = useUsersByIds(
    !isEditing && formData.userId ? [formData.userId] : [],
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
        <div className="grid gap-4 py-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5">
              关联用户 *
            </Label>
            {isEditing ? (
              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3">
                <UserDisplay userId={editingEmployee.id} size="small" />
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
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                姓名 *
              </Label>
              <Input
                value={formData.name}
                readOnly
                className="bg-muted"
                placeholder="选择用户后自动填充"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                岗位 *
              </Label>
              <Input
                value={formData.position}
                onChange={(e) =>
                  setFormData({ ...formData, position: e.target.value })
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                员工编号
              </Label>
              <Input
                value={formData.employeeNo}
                onChange={(e) =>
                  setFormData({ ...formData, employeeNo: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                职级
              </Label>
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
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                角色
              </Label>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3">
                <span className="text-sm">
                  {formData.role === 'admin'
                    ? '管理员'
                    : formData.role === 'hrd'
                      ? 'HRD'
                      : formData.role === 'dept_head'
                        ? '部门负责人'
                        : formData.role === 'supervisor'
                          ? '上级'
                          : '员工'}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  （根据角色自动分配）
                </span>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                部门
              </Label>
              <DepartmentTreeSelect
                value={formData.department}
                onChange={(name) =>
                  setFormData({ ...formData, department: name })
                }
                placeholder="选择部门"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                上级
              </Label>
              <UserSelect
                value={formData.supervisorId || null}
                onChange={(v) =>
                  setFormData({ ...formData, supervisorId: v ?? '' })
                }
                placeholder="不指定则由部门负责人自动填充"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">
                手机号
              </Label>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSave}>{editingEmployee ? '保存' : '创建'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeFormDialog;
