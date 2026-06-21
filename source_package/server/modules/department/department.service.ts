import { Injectable, Logger, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, asc, count, sql } from 'drizzle-orm';
import {
  department,
  employee,
  auditLog,
} from '@server/database/schema';
import type {
  DepartmentItem,
  DepartmentTreeNode,
  DepartmentListResponse,
  CreateDepartmentRequest,
} from '@shared/api.interface';

@Injectable()
export class DepartmentService {
  private readonly logger = new Logger(DepartmentService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(): Promise<DepartmentListResponse> {
    const rows = await this.db
      .select({
        id: department.id,
        name: department.name,
        parentId: department.parentId,
        headId: department.headId,
        sortOrder: department.sortOrder,
        isActive: department.isActive,
        createdAt: department.createdAt,
        headName: sql`COALESCE((SELECT e.name FROM employee e WHERE (e.id).user_id = (${department.headId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
        parentName: sql`COALESCE((SELECT d2.name FROM department d2 WHERE d2.id = ${department.parentId} LIMIT 1), '')`,
        memberCount: sql`(SELECT COUNT(*)::int FROM employee e WHERE e.department = ${department.name} AND e.status = 'active' AND e.deleted_at IS NULL)`,
      })
      .from(department)
      .orderBy(asc(department.sortOrder), asc(department.name));

    const items: DepartmentItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId || '',
      parentName: String(r.parentName || ''),
      headId: r.headId || '',
      headName: String(r.headName || ''),
      memberCount: Number(r.memberCount),
      sortOrder: Number(r.sortOrder),
      isActive: Boolean(r.isActive),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    const tree = this.buildTree(items);

    return { items, tree };
  }

  async detail(id: string): Promise<DepartmentTreeNode> {
    const rows = await this.db
      .select({
        id: department.id,
        name: department.name,
        parentId: department.parentId,
        headId: department.headId,
        sortOrder: department.sortOrder,
        isActive: department.isActive,
        createdAt: department.createdAt,
        headName: sql`COALESCE((SELECT e.name FROM employee e WHERE (e.id).user_id = (${department.headId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
        parentName: sql`COALESCE((SELECT d2.name FROM department d2 WHERE d2.id = ${department.parentId} LIMIT 1), '')`,
        memberCount: sql`(SELECT COUNT(*)::int FROM employee e WHERE e.department = ${department.name} AND e.status = 'active' AND e.deleted_at IS NULL)`,
      })
      .from(department)
      .where(eq(department.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('部门不存在');
    }

    const r = rows[0];
    const item: DepartmentItem = {
      id: r.id,
      name: r.name,
      parentId: r.parentId || '',
      parentName: String(r.parentName || ''),
      headId: r.headId || '',
      headName: String(r.headName || ''),
      memberCount: Number(r.memberCount),
      sortOrder: Number(r.sortOrder),
      isActive: Boolean(r.isActive),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    };

    const children = await this.db
      .select({
        id: department.id,
        name: department.name,
        parentId: department.parentId,
        headId: department.headId,
        sortOrder: department.sortOrder,
        isActive: department.isActive,
        createdAt: department.createdAt,
        headName: sql`COALESCE((SELECT e.name FROM employee e WHERE (e.id).user_id = (${department.headId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
        parentName: sql`''`,
        memberCount: sql`(SELECT COUNT(*)::int FROM employee e WHERE e.department = ${department.name} AND e.status = 'active' AND e.deleted_at IS NULL)`,
      })
      .from(department)
      .where(eq(department.parentId, id))
      .orderBy(asc(department.sortOrder), asc(department.name));

    const childItems: DepartmentItem[] = children.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId || '',
      parentName: String(c.parentName || ''),
      headId: c.headId || '',
      headName: String(c.headName || ''),
      memberCount: Number(c.memberCount),
      sortOrder: Number(c.sortOrder),
      isActive: Boolean(c.isActive),
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
    }));

    return {
      ...item,
      children: childItems.map((c) => ({ ...c, children: [] })),
    };
  }

  async create(body: CreateDepartmentRequest, userId: string): Promise<{ id: string }> {
    const existing = await this.db
      .select({ id: department.id })
      .from(department)
      .where(eq(department.name, body.name))
      .limit(1);
    if (existing.length > 0) {
      throw new BadRequestException('部门名称已存在');
    }

    const [inserted] = await this.db
      .insert(department)
      .values({
        name: body.name,
        parentId: body.parentId || null,
        headId: body.headId || null,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning({ id: department.id });

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'create_department',
      targetType: 'department',
      targetId: inserted.id,
      changes: { after: body },
    });

    return { id: inserted.id };
  }

  async update(id: string, body: CreateDepartmentRequest, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: department.id })
      .from(department)
      .where(eq(department.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('部门不存在');
    }

    if (body.parentId && body.parentId === id) {
      throw new BadRequestException('部门不能将自己设为上级');
    }

    await this.db
      .update(department)
      .set({
        name: body.name,
        parentId: body.parentId || null,
        headId: body.headId || null,
        sortOrder: body.sortOrder ?? 0,
      })
      .where(eq(department.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'update_department',
      targetType: 'department',
      targetId: id,
      changes: { after: body },
    });

    return { success: true };
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: department.id, name: department.name })
      .from(department)
      .where(eq(department.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('部门不存在');
    }

    const children = await this.db
      .select({ cnt: count() })
      .from(department)
      .where(eq(department.parentId, id));
    if (Number(children[0].cnt) > 0) {
      throw new BadRequestException('该部门下还有子部门，无法删除');
    }

    await this.db
      .delete(department)
      .where(eq(department.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'delete_department',
      targetType: 'department',
      targetId: id,
      changes: { before: { name: rows[0].name } },
    });

    return { success: true };
  }

  
  async listFlat() {
    const rows = await this.db
      .select({
        id: department.id,
        name: department.name,
        parentId: department.parentId,
        headId: department.headId,
        sortOrder: department.sortOrder,
        isActive: department.isActive,
        createdAt: department.createdAt,
        parentName: sql`COALESCE((SELECT d2.name FROM department d2 WHERE d2.id = ${department.parentId} LIMIT 1), '')`,
        memberCount: sql`(SELECT COUNT(*)::int FROM employee e WHERE e.department = ${department.name} AND e.status = 'active' AND e.deleted_at IS NULL)`,
        headName: sql`COALESCE((SELECT e.name FROM employee e WHERE (e.id).user_id = (${department.headId}).user_id AND e.deleted_at IS NULL LIMIT 1), '')`,
      })
      .from(department)
      .where(eq(department.isActive, true))
      .orderBy(asc(department.sortOrder), asc(department.name));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId || '',
      parentName: String(r.parentName || ''),
      headId: r.headId || '',
      headName: String(r.headName || ''),
      memberCount: Number(r.memberCount),
      sortOrder: Number(r.sortOrder),
      isActive: Boolean(r.isActive),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  }


  private buildTree(items: DepartmentItem[]): DepartmentTreeNode[] {
    const map = new Map<string, DepartmentTreeNode>();
    const roots: DepartmentTreeNode[] = [];

    for (const item of items) {
      map.set(item.id, { ...item, children: [] });
    }

    for (const item of items) {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortNodes = (nodes: DepartmentTreeNode[]) => {
      nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      nodes.forEach((n) => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
  }
}