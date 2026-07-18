import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
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

type LockedEmployeeAuthorization = {
  employeeId: string;
  authorizationRoles: string[];
  authorizationStatus: string;
  authorizationVersion: number;
};

type StagedAuthorization = {
  employeeId: string;
  version: number;
};

type HeadMutationEntitlement = {
  isAdmin: boolean;
  canEdit: boolean;
};

type AuthorizationProcessingFailure = {
  employeeId: string;
  version: number;
  status: string;
  error: string;
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
          headId: null,
          sortOrder: body.sortOrder ?? 0,
        })
        .returning({ id: department.id });

      await this.lockDepartment(tx, inserted.id);
      const lockedEmployees = body.headId
        ? await this.lockEmployeeAuthorizations(tx, [body.headId])
        : [];

      if (body.headId) {
        await tx
          .update(department)
          .set({ headId: body.headId })
          .where(eq(department.id, inserted.id));
      }

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'create_department',
        targetType: 'department',
        targetId: inserted.id,
        changes: { after: body },
      });

      const authorizations = await this.stageCurrentDepartmentHeadRoles(
        tx,
        lockedEmployees,
      );

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
    const newHeadId = body.headId || null;
    const headEntitlement = await this.getHeadMutationEntitlement(userId);

    const authorizations = await this.db.transaction(async (tx) => {
      const oldDept = await this.lockDepartment(tx, id);
      const oldHeadId = oldDept.headId || null;
      const headChanged = newHeadId !== oldHeadId;
      if (headChanged) {
        this.assertHeadMutationEntitlement(headEntitlement);
      }
      const affectedEmployeeIds = [oldHeadId, newHeadId].filter(
        (employeeId): employeeId is string => Boolean(employeeId),
      );
      const lockedEmployees = headChanged
        ? await this.lockEmployeeAuthorizations(tx, affectedEmployeeIds)
        : [];

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

      if (headChanged && newHeadId) {
        const deptName = oldDept.name;
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

      return this.stageCurrentDepartmentHeadRoles(tx, lockedEmployees);
    });

    await this.processAuthorizations(authorizations);
    return { success: true };
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const scope = await this.getReadableScope(userId);
    this.assertDepartmentInScope(scope, id);
    const headEntitlement = await this.getHeadMutationEntitlement(userId);

    const authorizations = await this.db.transaction(async (tx) => {
      const lockedDepartment = await this.lockDepartment(tx, id);
      const children = await tx
        .select({ cnt: count() })
        .from(department)
        .where(eq(department.parentId, id));
      if (Number(children[0].cnt) > 0) {
        throw new BadRequestException('该部门下还有子部门，无法删除');
      }
      const headId = lockedDepartment.headId || null;
      const lockedEmployees = headId
        ? await this.lockEmployeeAuthorizations(tx, [headId])
        : [];

      await tx.delete(department).where(eq(department.id, id));

      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'delete_department',
        targetType: 'department',
        targetId: id,
        changes: { before: { name: lockedDepartment.name } },
      });

      if (headId) {
        const stillHead = await this.hasDepartmentHeadAssignment(tx, headId);
        if (!stillHead) {
          this.assertHeadMutationEntitlement(headEntitlement);
        }
      }
      return this.stageCurrentDepartmentHeadRoles(tx, lockedEmployees);
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
    const entitlement = await this.getHeadMutationEntitlement(userId);
    this.assertHeadMutationEntitlement(entitlement);
  }

  private async getHeadMutationEntitlement(
    userId: string,
  ): Promise<HeadMutationEntitlement> {
    const roles = await this.roleManagerService.getUserRoles(userId);
    const isAdmin = roles.includes('admin');
    const canEdit = isAdmin
      ? await this.roleManagerService.checkUserPermission(
          userId,
          'permission_management',
          'edit',
        )
      : false;
    return { isAdmin, canEdit };
  }

  private assertHeadMutationEntitlement(
    entitlement: HeadMutationEntitlement,
  ): void {
    if (!entitlement.isAdmin) {
      throw new ForbiddenException('只有系统管理员可修改部门负责人');
    }
    if (!entitlement.canEdit) {
      throw new ForbiddenException('无权修改部门负责人');
    }
  }

  private async lockDepartment(
    tx: PostgresJsDatabase,
    departmentId: string,
  ): Promise<{ id: string; name: string; headId: string | null }> {
    const rows = await tx
      .select({
        id: department.id,
        name: department.name,
        headId: department.headId,
      })
      .from(department)
      .where(eq(department.id, departmentId))
      .for('update');
    if (rows.length === 0) {
      throw new NotFoundException('部门不存在');
    }
    return rows[0];
  }

  private async lockEmployeeAuthorizations(
    tx: PostgresJsDatabase,
    employeeIds: string[],
  ): Promise<LockedEmployeeAuthorization[]> {
    const sortedEmployeeIds = Array.from(new Set(employeeIds)).sort((a, b) =>
      a.localeCompare(b),
    );
    if (sortedEmployeeIds.length === 0) {
      return [];
    }

    const employeeIdColumn = sql<string>`(${employee.employeeId}).user_id`;
    const rows = await tx
      .select({
        employeeId: employeeIdColumn,
        authorizationRoles: employee.authorizationRoles,
        authorizationStatus: employee.authorizationStatus,
        authorizationVersion: employee.authorizationVersion,
      })
      .from(employee)
      .where(inArray(employeeIdColumn, sortedEmployeeIds))
      .orderBy(employeeIdColumn)
      .for('update');
    const rowByEmployeeId = new Map(
      rows.map((row) => [
        row.employeeId,
        {
          ...row,
          authorizationRoles: this.getDurableRoles(row.authorizationRoles),
        },
      ]),
    );
    return sortedEmployeeIds.map((employeeId) => {
      const row = rowByEmployeeId.get(employeeId);
      if (!row) {
        throw new BadRequestException(`部门负责人 ${employeeId} 不存在`);
      }
      return row;
    });
  }

  private async stageCurrentDepartmentHeadRoles(
    tx: PostgresJsDatabase,
    lockedEmployees: LockedEmployeeAuthorization[],
  ): Promise<StagedAuthorization[]> {
    const staged: StagedAuthorization[] = [];

    for (const row of lockedEmployees) {
      const currentRoles = row.authorizationRoles;
      const isDepartmentHead = await this.hasDepartmentHeadAssignment(
        tx,
        row.employeeId,
      );
      const desiredRoles = normalizeAuthorizationRoles(
        isDepartmentHead
          ? [...currentRoles, 'dept_head']
          : currentRoles.filter((role) => role !== 'dept_head'),
      );

      if (this.sameRoles(currentRoles, desiredRoles)) {
        if (
          row.authorizationStatus === 'pending' ||
          row.authorizationStatus === 'failed'
        ) {
          staged.push({
            employeeId: row.employeeId,
            version: row.authorizationVersion,
          });
        }
        continue;
      }

      const version =
        await this.authorizationSyncService.stageAuthorizationChange(
          tx,
          row.employeeId,
          desiredRoles,
        );
      staged.push({ employeeId: row.employeeId, version });
    }

    return staged;
  }

  private async hasDepartmentHeadAssignment(
    tx: PostgresJsDatabase,
    employeeId: string,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: department.id })
      .from(department)
      .where(sql`(${department.headId}).user_id = ${employeeId}`)
      .limit(1);
    return rows.length > 0;
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
    const outcomes = await Promise.all(
      authorizations.map(async (authorization) => {
        try {
          const result =
            await this.authorizationSyncService.processEmployeeAuthorization(
              authorization.employeeId,
              authorization.version,
            );
          return {
            employeeId: authorization.employeeId,
            version: authorization.version,
            status: result.status,
            error: result.error,
          };
        } catch (error) {
          return {
            employeeId: authorization.employeeId,
            version: authorization.version,
            status: 'rejected',
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );
    const failures: AuthorizationProcessingFailure[] = outcomes
      .filter((outcome) => outcome.status !== 'synced')
      .map((outcome) => ({
        employeeId: outcome.employeeId,
        version: outcome.version,
        status: outcome.status,
        error:
          outcome.error || `Authorization sync finished with ${outcome.status}`,
      }));
    if (failures.length > 0) {
      throw new ServiceUnavailableException({
        message: '部门负责人授权同步失败',
        failures,
      });
    }
  }
}
