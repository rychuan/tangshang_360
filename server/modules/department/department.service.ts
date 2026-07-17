import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, asc, count, sql, isNull } from 'drizzle-orm';
import { department, employee, auditLog } from '@server/database/schema';
import { EmployeeRepository } from '../employee-management/employee.repository';
import { RoleManagerService } from '../role-manager/role-manager.service';
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
    private readonly employeeRepo: EmployeeRepository,
    private readonly roleManagerService: RoleManagerService,
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
        headName: sql`COALESCE(${this.employeeRepo.nameSubquery(department.headId)}, '')`,
        parentName: sql`COALESCE((SELECT d2.name FROM department d2 WHERE d2.id = ${department.parentId} LIMIT 1), '')`,
      })
      .from(department)
      .orderBy(asc(department.sortOrder), asc(department.name));

    const memberCountMap = await this.employeeRepo.getDepartmentMemberCounts();

    const items: DepartmentItem[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId || '',
      parentName: String(r.parentName || ''),
      headId: r.headId || '',
      headName: String(r.headName || ''),
      memberCount: memberCountMap.get(r.name) || 0,
      sortOrder: Number(r.sortOrder),
      isActive: Boolean(r.isActive),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
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
        headName: sql`COALESCE(${this.employeeRepo.nameSubquery(department.headId)}, '')`,
        parentName: sql`COALESCE((SELECT d2.name FROM department d2 WHERE d2.id = ${department.parentId} LIMIT 1), '')`,
      })
      .from(department)
      .where(eq(department.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('部门不存在');
    }

    const memberCountMap = await this.employeeRepo.getDepartmentMemberCounts();

    const r = rows[0];
    const item: DepartmentItem = {
      id: r.id,
      name: r.name,
      parentId: r.parentId || '',
      parentName: String(r.parentName || ''),
      headId: r.headId || '',
      headName: String(r.headName || ''),
      memberCount: memberCountMap.get(r.name) || 0,
      sortOrder: Number(r.sortOrder),
      isActive: Boolean(r.isActive),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
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
        headName: sql`COALESCE(${this.employeeRepo.nameSubquery(department.headId)}, '')`,
        parentName: sql`''`,
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
      memberCount: memberCountMap.get(c.name) || 0,
      sortOrder: Number(c.sortOrder),
      isActive: Boolean(c.isActive),
      createdAt:
        c.createdAt instanceof Date
          ? c.createdAt.toISOString()
          : String(c.createdAt),
    }));

    return {
      ...item,
      children: childItems.map((c) => ({ ...c, children: [] })),
    };
  }

  async create(
    body: CreateDepartmentRequest,
    userId: string,
  ): Promise<{ id: string }> {
    if (body.headId) {
      await this.assertHeadMutationPermission(userId);
    }

    const existing = await this.db
      .select({ id: department.id })
      .from(department)
      .where(eq(department.name, body.name))
      .limit(1);
    if (existing.length > 0) {
      throw new BadRequestException('部门名称已存在');
    }

    return this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(department)
        .values({
          name: body.name,
          parentId: body.parentId || null,
          headId: body.headId || null,
          sortOrder: body.sortOrder ?? 0,
        })
        .returning({ id: department.id });

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'create_department',
        targetType: 'department',
        targetId: inserted.id,
        changes: { after: body },
      });

      if (body.headId) {
        await this.roleManagerService.ensureUserRoleStrict(
          body.headId,
          'dept_head',
        );
      }

      return { id: inserted.id };
    });
  }

  async update(
    id: string,
    body: CreateDepartmentRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({
        id: department.id,
        oldHeadId: department.headId,
        oldName: department.name,
      })
      .from(department)
      .where(eq(department.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('部门不存在');
    }

    if (body.parentId && body.parentId === id) {
      throw new BadRequestException('部门不能将自己设为上级');
    }

    const oldDept = rows[0];
    const oldHeadId = oldDept.oldHeadId || null;
    const newHeadId = body.headId || null;
    const headChanged = newHeadId !== oldHeadId;
    if (headChanged) {
      await this.assertHeadMutationPermission(userId);
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(department)
        .set({
          name: body.name,
          parentId: body.parentId || null,
          headId: newHeadId,
          sortOrder: body.sortOrder ?? 0,
        })
        .where(eq(department.id, id));

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'update_department',
        targetType: 'department',
        targetId: id,
        changes: { after: body },
      });

      if (newHeadId !== oldHeadId && newHeadId) {
        const deptName = oldDept.oldName;
        await tx
          .update(employee)
          .set({ supervisorId: newHeadId })
          .where(
            and(
              eq(employee.department, deptName),
              isNull(employee.deletedAt),
              sql`(((${employee.supervisorId}) IS NULL) OR ((${employee.supervisorId}).user_id = ${oldHeadId}))`,
            ),
          );
        this.logger.log(
          `Department "${deptName}" head changed, synced employees supervisor to new head`,
        );
      }

      if (oldHeadId && oldHeadId !== newHeadId) {
        const stillHead = await tx
          .select({ id: department.id })
          .from(department)
          .where(eq(department.headId, oldHeadId))
          .limit(1);
        if (stillHead.length === 0) {
          await this.roleManagerService.removeUserRoleStrict(
            oldHeadId,
            'dept_head',
          );
        }
      }
      if (newHeadId && newHeadId !== oldHeadId) {
        await this.roleManagerService.ensureUserRoleStrict(
          newHeadId,
          'dept_head',
        );
      }
    });

    return { success: true };
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({
        id: department.id,
        name: department.name,
        headId: department.headId,
      })
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

    const headId = rows[0].headId || null;
    let removesFinalHeadRole = false;
    if (headId) {
      const otherHeadRows = await this.db
        .select({ id: department.id })
        .from(department)
        .where(
          and(
            eq(department.headId, headId),
            sql`${department.id} <> ${id}`,
          ),
        )
        .limit(1);
      removesFinalHeadRole = otherHeadRows.length === 0;
      if (removesFinalHeadRole) {
        await this.assertHeadMutationPermission(userId);
      }
    }

    await this.db.transaction(async (tx) => {
      await tx.delete(department).where(eq(department.id, id));

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'delete_department',
        targetType: 'department',
        targetId: id,
        changes: { before: { name: rows[0].name } },
      });

      if (headId && removesFinalHeadRole) {
        await this.roleManagerService.removeUserRoleStrict(headId, 'dept_head');
      }
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
        headName: sql`COALESCE(${this.employeeRepo.nameSubquery(department.headId)}, '')`,
      })
      .from(department)
      .where(eq(department.isActive, true))
      .orderBy(asc(department.sortOrder), asc(department.name));

    const memberCountMap = await this.employeeRepo.getDepartmentMemberCounts();

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId || '',
      parentName: String(r.parentName || ''),
      headId: r.headId || '',
      headName: String(r.headName || ''),
      memberCount: memberCountMap.get(r.name) || 0,
      sortOrder: Number(r.sortOrder),
      isActive: Boolean(r.isActive),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
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
      nodes.sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
      nodes.forEach((n) => sortNodes(n.children));
    };
    sortNodes(roots);

    return roots;
  }

  private async assertHeadMutationPermission(userId: string): Promise<void> {
    const roles = await this.roleManagerService.getUserRoles(userId);
    if (!roles.includes('admin')) {
      throw new ForbiddenException('只有系统管理员可修改部门负责人');
    }
    const canEditRoles = await this.roleManagerService.checkUserPermission(
      userId,
      'permission_management',
      'edit',
    );
    if (!canEditRoles) {
      throw new ForbiddenException('无权修改部门负责人');
    }
  }
}
