import type { I18nText, ForceRoleDTO } from '@shared/api.interface';
import { BUILTIN_ROLE_CODES } from '@shared/api.interface';

export const i18nText = (name?: I18nText): string =>
  name?.zh_cn || name?.en_us || '';

export const getRoleMemberCount = (role: ForceRoleDTO): number => {
  const m = role.roleMembers;
  if (!m) return 0;
  return (
    (m.userList?.length ?? 0) +
    (m.departmentList?.length ?? 0) +
    (m.groupChatList?.length ?? 0)
  );
};

export const isBuiltinRole = (bizID?: string): boolean =>
  !!bizID && (BUILTIN_ROLE_CODES as readonly string[]).includes(bizID);

export const ROLE_LABELS: Record<string, string> = {
  admin: '管理员',
  hrd: 'HRD',
  dept_head: '部门负责人',
  supervisor: '上级',
  employee: '员工',
};
