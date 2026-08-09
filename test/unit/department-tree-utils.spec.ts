import {
  buildTree,
  countEmployees,
  findNode,
  findNodeByName,
  findNodeName,
  findParentName,
  getAllDescendantIds,
} from '../../client/src/pages/EmployeeManagement/department-tree-utils';
import type { DepartmentTreeNode } from '../../shared/api.interface';

function node(
  id: string,
  name: string,
  memberCount = 0,
  children: DepartmentTreeNode[] = [],
): DepartmentTreeNode {
  return { id, name, memberCount, children } as DepartmentTreeNode;
}

const tree: DepartmentTreeNode[] = [
  node('dept-1', '研发部', 2, [
    node('dept-1-1', '前端组', 3, [node('dept-1-1-1', '移动端组', 1)]),
    node('dept-1-2', '后端组', 4),
  ]),
  node('dept-2', '销售部', 5, [node('dept-2-1', '华东区', 6)]),
];

describe('department-tree-utils', () => {
  describe('countEmployees', () => {
    it('sums member counts across the whole subtree', () => {
      expect(countEmployees(tree[0])).toBe(2 + 3 + 1 + 4);
      expect(countEmployees(tree[1])).toBe(5 + 6);
    });

    it('returns memberCount when there are no children', () => {
      expect(countEmployees(node('leaf', '叶子', 7))).toBe(7);
    });

    it('treats missing memberCount as zero', () => {
      expect(countEmployees(node('empty', '空', 0))).toBe(0);
    });
  });

  describe('getAllDescendantIds', () => {
    it('collects self and all descendants', () => {
      expect(getAllDescendantIds(tree[0])).toEqual([
        'dept-1',
        'dept-1-1',
        'dept-1-1-1',
        'dept-1-2',
      ]);
    });
  });

  describe('findNode / findNodeName', () => {
    it('finds a deeply nested node by id', () => {
      expect(findNode(tree, 'dept-1-1-1')?.name).toBe('移动端组');
    });

    it('returns null when the id is absent', () => {
      expect(findNode(tree, 'missing')).toBeNull();
    });

    it('resolves the display name by id', () => {
      expect(findNodeName(tree, 'dept-2-1')).toBe('华东区');
      expect(findNodeName(tree, 'missing')).toBeNull();
    });
  });

  describe('findNodeByName / findParentName', () => {
    it('finds a node by name, preferring the first match', () => {
      expect(findNodeByName(tree, '后端组')?.id).toBe('dept-1-2');
    });

    it('returns null when the name is absent', () => {
      expect(findNodeByName(tree, '不存在')).toBeNull();
    });

    it('resolves the display name of the parent node by id', () => {
      expect(findParentName(tree, 'dept-1-1')).toBe('前端组');
      expect(findParentName(tree, 'dept-1-1-1')).toBe('移动端组');
    });

    it('returns empty string when the parent cannot be found', () => {
      expect(findParentName(tree, 'unknown')).toBe('');
    });
  });

  describe('buildTree', () => {
    it('returns the original nodes when the filter is empty', () => {
      expect(buildTree(tree, '')).toBe(tree);
    });

    it('keeps ancestors of matching descendants', () => {
      const filtered = buildTree(tree, '移动端');
      expect(filtered.map((n) => n.id)).toEqual(['dept-1']);
      expect(filtered[0].children?.map((c) => c.id)).toEqual(['dept-1-1']);
      expect(filtered[0].children?.[0].children?.map((c) => c.id)).toEqual([
        'dept-1-1-1',
      ]);
    });

    it('drops non-matching branches entirely', () => {
      const filtered = buildTree(tree, '销售');
      expect(filtered.map((n) => n.id)).toEqual(['dept-2']);
    });

    it('is case-insensitive', () => {
      const filtered = buildTree(tree, '移动');
      expect(filtered.length).toBeGreaterThan(0);
    });

    it('returns an empty array when nothing matches', () => {
      expect(buildTree(tree, 'zzz')).toEqual([]);
    });
  });
});
