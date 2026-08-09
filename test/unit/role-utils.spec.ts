import {
  i18nText,
  getRoleMemberCount,
  isBuiltinRole,
  ROLE_LABELS,
} from '../../client/src/pages/EmployeeManagement/role-utils';
import type { ForceRoleDTO } from '../../shared/api.interface';

function role(partial: Partial<ForceRoleDTO>): ForceRoleDTO {
  return {
    bizID: 'custom-role',
    name: { zh_cn: '自定义角色', en_us: 'Custom Role' },
    ...partial,
  } as ForceRoleDTO;
}

describe('role-utils', () => {
  describe('i18nText', () => {
    it('prefers zh_cn over en_us', () => {
      expect(
        i18nText({ zh_cn: '管理员', en_us: 'Admin' }),
      ).toBe('管理员');
    });

    it('falls back to en_us', () => {
      expect(i18nText({ en_us: 'HRD' })).toBe('HRD');
    });

    it('returns empty string when no text is available', () => {
      expect(i18nText(undefined)).toBe('');
      expect(i18nText({})).toBe('');
    });
  });

  describe('getRoleMemberCount', () => {
    it('sums users, departments and group chats', () => {
      const r = role({
        roleMembers: {
          userList: [{ userID: 'u1' }, { userID: 'u2' }],
          departmentList: [{ departmentID: 'd1' }],
          groupChatList: [{ chatID: 'c1' }, { chatID: 'c2' }, { chatID: 'c3' }],
        },
      });
      expect(getRoleMemberCount(r)).toBe(6);
    });

    it('handles allEmployees / presetGroup meta without double counting', () => {
      const r = role({
        roleMembers: {
          allEmployees: true,
          userList: [{ userID: 'u1' }],
        },
      });
      // 只有显式成员名单计入数量，allEmployees 是语义标记
      expect(getRoleMemberCount(r)).toBe(1);
    });

    it('returns zero when roleMembers is missing', () => {
      expect(getRoleMemberCount(role({}))).toBe(0);
    });
  });

  describe('isBuiltinRole', () => {
    it.each(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])(
      'recognizes the builtin role %s',
      (bizID) => {
        expect(isBuiltinRole(bizID)).toBe(true);
      },
    );

    it('rejects custom and unknown roles', () => {
      expect(isBuiltinRole('custom-role')).toBe(false);
      expect(isBuiltinRole(undefined)).toBe(false);
    });
  });

  describe('ROLE_LABELS', () => {
    it('covers every builtin role with a display label', () => {
      expect(Object.keys(ROLE_LABELS).sort()).toEqual([
        'admin',
        'dept_head',
        'employee',
        'hrd',
        'supervisor',
      ]);
    });
  });
});
