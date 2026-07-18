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
import { eq, and, asc, count, sql, isNull, inArray } from 'drizzle-orm';
import { department, employee, auditLog } from '@server/database/schema';
import { EmployeeRepository } from '../employee-management/employee.repository';
import { RoleManagerService } from '../role-manager/role-manager.service';
import { AuthorizationSyncService } from '../role-manager/authorization-sync.service';
import { normalizeAuthorizationRoles } from '../role-manager/authorization-state';
import {
  AccessScopeService,
  type AccessScope,
} from '@server/common/access/access-scope.service';
import type {
  DepartmentItem,
  DepartmentTreeNode,
  DepartmentListResponse,
  CreateDepartmentRequest,
} from '@shared/api.interface';

type DepartmentHeadRoleChange = {
  employeeId: string;
  mutation: 'add' | 'remove';
};

type StagedAuthorization = {
  employeeId: string;
  version: number;
};

@Injectable()
export class DepartmentService {
  private readonly logger = new Logger(DepartmentService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly employeeRepo: EmployeeRepository,
    private readonly roleManagerService: RoleManagerService,
    private readonly accessScopeService: AccessScopeService,
    private readonly authorizationSyncService: AuthorizationSyncService,
  ) {}

  async list(userId: string): Promise<DepartmentListResponse> {
    const scope = await this.getReadableScope(userId);
    const scopeCondition =
      scope.kind === 'managed'
        ? inArray(department.id, scope.departmentIds)
        : undefined;
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
      .where(scopeCondition)
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

  async detail(id: string, userId: string): Promise<DepartmentTreeNode> {
    const scope = await this.getReadableScope(userId);
    this.assertDepartmentInScope(scope, id);

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

    const childCondition =
      scope.kind === 'managed'
        ? and(
            eq(department.parentId, id),
            inArray(department.id, scope.departmentIds),
          )
        : eq(department.parentId, id);
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
      .where(childCondition)
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
    await this.assertGlobalScope(userId);

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

    const result = await this.db.transaction(async (tx) => {
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

      const authorizations = body.headId
        ? await this.stageDepartmentHeadRoleChanges(tx, [
            { employeeId: body.headId, mutation: 'add' },
          ])
        : [];

      return { id: inserted.id, authorizations };
    });

    await this.processAuthorizations(result.authorizations);
    return { id: result.id };
  }

  async update(
    id: string,
    body: CreateDepartmentRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    const scope = await this.getReadableScope(userId);
    this.assertDepartmentInScope(scope, id);
    if (body.parentId && body.parentId === id) {
      throw new BadRequestException('部门不能将自己设为上级');
    }
    if (body.parentId) {
      this.assertDepartmentInScope(scope, body.parentId);
    }

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

    const oldDept = rows[0];
    const oldHeadId = oldDept.oldHeadId || null;
    const newHeadId = body.headId || null;
    const headChanged = newHeadId !== oldHeadId;
    if (headChanged) {
      await this.assertHeadMutationPermission(userId);
    }

    const authorizations = await this.db.transaction(async (tx) => {
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

      const roleChanges: DepartmentHeadRoleChange[] = [];
      if (oldHeadId && oldHeadId !== newHeadId) {
        const stillHead = await tx
          .select({ id: department.id })
          .from(department)
          .where(eq(department.headId, oldHeadId))
          .limit(1);
        if (stillHead.length === 0) {
          roleChanges.push({
            employeeId: oldHeadId,
            mutation: 'remove',
          });
        }
      }
      if (newHeadId && newHeadId !== oldHeadId) {
        roleChanges.push({
          employeeId: newHeadId,
          mutation: 'add',
        });
      }

      return this.stageDepartmentHeadRoleChanges(tx, roleChanges);
    });

    await this.processAuthorizations(authorizations);
    return { success: true };
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const scope = await this.getReadableScope(userId);
    this.assertDepartmentInScope(scope, id);

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
          and(eq(department.headId, headId), sql`${department.id} <> ${id}`),
        )
        .limit(1);
      removesFinalHeadRole = otherHeadRows.length === 0;
      if (removesFinalHeadRole) {
        await this.assertHeadMutationPermission(userId);
      }
    }

    const authorizations = await this.db.transaction(async (tx) => {
      await tx.delete(department).where(eq(department.id, id));

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'delete_department',
        targetType: 'department',
        targetId: id,
        changes: { before: { name: rows[0].name } },
      });

      if (headId && removesFinalHeadRole) {
        return this.stageDepartmentHeadRoleChanges(tx, [
          { employeeId: headId, mutation: 'remove' },
        ]);
      }
      return [];
    });

    await this.processAuthorizations(authorizations);
    return { success: true };
  }

  async listFlat(userId: string) {
    const scope = await this.getReadableScope(userId);
    const scopeCondition =
      scope.kind === 'managed'
        ? inArray(department.id, scope.departmentIds)
        : undefined;
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
      .where(
        scopeCondition
          ? and(eq(department.isActive, true), scopeCondition)
          : eq(department.isActive, true),
      )
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

  private async getReadableScope(userId: string): Promise<AccessScope> {
    const scope = await this.accessScopeService.getScope(userId);
    if (scope.kind === 'global') {
      return scope;
    }
    if (scope.kind === 'managed' && scope.departmentIds.length > 0) {
      return scope;
    }
    throw new ForbiddenException('无权访问部门数据');
  }

  private async assertGlobalScope(userId: string): Promise<void> {
    const scope = await this.accessScopeService.getScope(userId);
    if (scope.kind !== 'global') {
      throw new ForbiddenException('只有全局范围用户可创建部门');
    }
  }

  private assertDepartmentInScope(scope: AccessScope, id: string): void {
    if (scope.kind === 'global') {
      return;
    }
    if (scope.kind !== 'managed' || !scope.departmentIds.includes(id)) {
      throw new ForbiddenException('无权访问该部门');
    }
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

  private async stageDepartmentHeadRoleChanges(
    tx: PostgresJsDatabase,
    changes: DepartmentHeadRoleChange[],
  ): Promise<StagedAuthorization[]> {
    if (changes.length === 0) {
      return [];
    }

    const mutationByEmployeeId = new Map(
      changes.map((change) => [change.employeeId, change.mutation]),
    );
    const employeeIds = Array.from(mutationByEmployeeId.keys()).sort((a, b) =>
      a.localeCompare(b),
    );
    const employeeIdColumn = sql<string>`(${employee.employeeId}).user_id`;
    const rows = await tx
      .select({
        employeeId: employeeIdColumn,
        authorizationRoles: employee.authorizationRoles,
        authorizationStatus: employee.authorizationStatus,
        authorizationVersion: employee.authorizationVersion,
      })
      .from(employee)
      .where(inArray(employeeIdColumn, employeeIds))
      .orderBy(employeeIdColumn)
      .for('update');
    const rowByEmployeeId = new Map(rows.map((row) => [row.employeeId, row]));
    const staged: StagedAuthorization[] = [];

    for (const employeeId of employeeIds) {
      const row = rowByEmployeeId.get(employeeId);
      if (!row) {
        throw new BadRequestException(`部门负责人 ${employeeId} 不存在`);
      }
      const currentRoles = this.getDurableRoles(row.authorizationRoles);
      const desiredRoles = normalizeAuthorizationRoles(
        mutationByEmployeeId.get(employeeId) === 'add'
          ? [...currentRoles, 'dept_head']
          : currentRoles.filter((role) => role !== 'dept_head'),
      );

      if (this.sameRoles(currentRoles, desiredRoles)) {
        if (
          row.authorizationStatus === 'pending' ||
          row.authorizationStatus === 'failed'
        ) {
          staged.push({
            employeeId,
            version: row.authorizationVersion,
          });
        }
        continue;
      }

      const version =
        await this.authorizationSyncService.stageAuthorizationChange(
          tx,
          employeeId,
          desiredRoles,
        );
      staged.push({ employeeId, version });
    }

    return staged;
  }

  private getDurableRoles(value: unknown): string[] {
    if (
      !Array.isArray(value) ||
      value.some((role) => typeof role !== 'string')
    ) {
      throw new BadRequestException('员工授权角色数据无效');
    }
    return normalizeAuthorizationRoles(value);
  }

  private sameRoles(left: string[], right: string[]): boolean {
    return (
      left.length === right.length &&
      left.every((role, index) => role === right[index])
    );
  }

  private async processAuthorizations(
    authorizations: StagedAuthorization[],
  ): Promise<void> {
    for (const authorization of authorizations) {
      const result =
        await this.authorizationSyncService.processEmployeeAuthorization(
          authorization.employeeId,
          authorization.version,
        );
      if (result.status !== 'synced') {
        throw new Error(
          result.error ||
            `Employee ${authorization.employeeId} authorization sync finished with ${result.status}`,
        );
      }
    }
  }
}
