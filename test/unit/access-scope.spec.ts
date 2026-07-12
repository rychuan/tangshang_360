import { classifyAccessScope } from '../../server/common/access/access-scope.service';

describe('classifyAccessScope', () => {
  it('treats admin and hrd as global access', () => {
    expect(classifyAccessScope(['admin'], false, false)).toBe('global');
    expect(classifyAccessScope(['hrd'], false, false)).toBe('global');
  });

  it('treats department heads and supervisors as managed access', () => {
    expect(classifyAccessScope(['dept_head'], false, false)).toBe('managed');
    expect(classifyAccessScope(['employee'], true, false)).toBe('managed');
    expect(classifyAccessScope(['supervisor'], false, false)).toBe('managed');
    expect(classifyAccessScope(['employee'], false, true)).toBe('managed');
  });

  it('falls back to self access for regular employees', () => {
    expect(classifyAccessScope(['employee'], false, false)).toBe('self');
    expect(classifyAccessScope([], false, false)).toBe('self');
  });
});
