import type { DepartmentTreeNode } from '@shared/api.interface';

/** 递归统计节点及其子树中的员工总数 */
export function countEmployees(node: DepartmentTreeNode): number {
  const childCount =
    node.children?.reduce((sum, c) => sum + countEmployees(c), 0) ?? 0;
  return (node.memberCount ?? 0) + childCount;
}

/** 获取所有子孙节点 ID */
export function getAllDescendantIds(node: DepartmentTreeNode): string[] {
  const ids = [node.id];
  node.children?.forEach((c) => ids.push(...getAllDescendantIds(c)));
  return ids;
}

/** 在树中按 ID 查找节点 */
export function findNode(
  nodes: DepartmentTreeNode[],
  id: string,
): DepartmentTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 在树中按名称查找节点 */
export function findNodeByName(
  nodes: DepartmentTreeNode[],
  name: string,
): DepartmentTreeNode | null {
  for (const n of nodes) {
    if (n.name === name) return n;
    if (n.children?.length) {
      const found = findNodeByName(n.children, name);
      if (found) return found;
    }
  }
  return null;
}

/** 在树中按 ID 查找节点名称 */
export function findNodeName(
  nodes: DepartmentTreeNode[],
  id: string,
): string | null {
  return findNode(nodes, id)?.name ?? null;
}

/** 在树中查找节点的父级名称 */
export function findParentName(
  nodes: DepartmentTreeNode[],
  parentId: string,
): string {
  for (const n of nodes) {
    if (n.id === parentId) return n.name;
    if (n.children?.length) {
      const found = findParentName(n.children, parentId);
      if (found) return found;
    }
  }
  return '';
}

/** 构建过滤后的树 */
export function buildTree(
  nodes: DepartmentTreeNode[],
  filter: string,
): DepartmentTreeNode[] {
  if (!filter) return nodes;
  const lower = filter.toLowerCase();
  const match = (n: DepartmentTreeNode): boolean =>
    n.name.toLowerCase().includes(lower) || (n.children?.some(match) ?? false);
  return nodes
    .filter(match)
    .map((n) => ({ ...n, children: buildTree(n.children, filter) }));
}
