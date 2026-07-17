import {
  Injectable,
  Inject,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, isNull, like, type SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  employeeBinding,
  employee,
  assessmentTemplate,
  auditLog,
} from '@server/database/schema';
import { EmployeeBindingService } from '../employee-management/employee-binding.service';
import { RoleManagerService } from '../role-manager/role-manager.service';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import { LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY } from '../employee-management/admin-safety';

@Injectable()
export class TeamStructureService {
  private readonly logger = new Logger(TeamStructureService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly bindingService: EmployeeBindingService,
    private readonly roleManagerService: RoleManagerService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  /**
   * 团队结构列表 — Drizzle ORM 版本，替代原原始 SQL 实现。
   */
  async list(
    query: {
      employeeName?: string;
      department?: string;
      position?: string;
      templateId?: string;
      page?: string;
      pageSize?: string;
    },
    userId: string,
  ) {
    await this.assertBindingView(userId);
    const pageNum = parseInt(query.page || '1', 10);
    const pageSizeNum = parseInt(query.pageSize || '10', 10);
    const offset = (pageNum - 1) * pageSizeNum;

    const conditions: SQL[] = [
      eq(employee.status, true),
      isNull(employee.deletedAt),
    ];
    const scopeCondition =
      await this.accessScopeService.buildEmployeeScopeCondition(userId, {
        includeSelf: true,
      });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (query.employeeName) {
      conditions.push(like(employee.name, `%${query.employeeName}%`));
    }
    if (query.department) {
      conditions.push(like(employee.department, `%${query.department}%`));
    }
    if (query.position) {
      conditions.push(like(employee.position, `%${query.position}%`));
    }
    if (query.templateId) {
      conditions.push(eq(assessmentTemplate.id, query.templateId));
    }

    const whereEmployee = and(...conditions);

    const joinOn = sql`(${employeeBinding.employeeId}).user_id = (${employee.employeeId}).user_id AND ${employeeBinding.status} = true`;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select({
          employeeId: sql<string>`(${employee.employeeId}).user_id`,
          employeeName: employee.name,
          position: employee.position,
          department: employee.department,
          supervisorId: sql<string>`(employee.supervisor_id).user_id`,
          supervisorName: sql<string>`(SELECT sup.name FROM ${employee} sup
            WHERE (sup.employee_id).user_id = (employee.supervisor_id).user_id
              AND sup.deleted_at IS NULL
            LIMIT 1)`,
          bindingId: employeeBinding.id,
          effectiveFrom: employeeBinding.effectiveFrom,
          bindingStatus: employeeBinding.status,
          templateId: assessmentTemplate.id,
          templateName: assessmentTemplate.name,
        })
        .from(employee)
        .leftJoin(employeeBinding, joinOn)
        .leftJoin(
          assessmentTemplate,
          eq(employeeBinding.templateId, assessmentTemplate.id),
        )
        .where(whereEmployee)
        .orderBy(employee.name)
        .limit(pageSizeNum)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(employee)
        .leftJoin(employeeBinding, joinOn)
        .leftJoin(
          assessmentTemplate,
          eq(employeeBinding.templateId, assessmentTemplate.id),
        )
        .where(whereEmployee),
    ]);

    const total = Number(countResult[0]?.total || 0);

    const mappedItems = itemsResult.map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      department: row.department,
      position: row.position,
      supervisorId: row.supervisorId || '',
      supervisorName: row.supervisorName || '',
      templateId: row.templateId || null,
      templateName: row.templateName || null,
      bindingId: row.bindingId || null,
      effectiveFrom: row.effectiveFrom || null,
      bindingStatus: row.bindingStatus || null,
    }));

    return { items: mappedItems, total };
  }

  /**
   * 创建员工-模板绑定 — 委托给 EmployeeBindingService。
   */
  async create(
    body: { employeeIds: string[]; templateId: string; effectiveFrom: string },
    operatorId: string,
  ) {
    return this.bindingService.batchBind(
      body.employeeIds,
      body.templateId,
      body.effectiveFrom,
      operatorId,
    );
  }

  /**
   * 批量停用员工。
   */
  async batchDeactivate(employeeIds: string[], operatorId: string) {
    if (employeeIds.length === 0) {
      return { success: true, deactivatedCount: 0 };
    }
    await this.assertEmployeeMutationScopes(operatorId, employeeIds);

    const requestedIds = [...new Set(employeeIds)];
    const requestedIdParams = sql.join(
      requestedIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const targetRows = await this.db
      .select({
        employeeId: sql<string>`(${employee.employeeId}).user_id`,
        role: employee.role,
      })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id IN (${requestedIdParams})`,
          eq(employee.status, true),
          isNull(employee.deletedAt),
        ),
      );
    const deactivatedIds = targetRows.map((row) => row.employeeId);
    if (deactivatedIds.length === 0) {
      return { success: true, deactivatedCount: 0 };
    }

    const deactivatedAdminCount = targetRows.filter((row) =>
      String(row.role || '')
        .split(',')
        .map((role) => role.trim())
        .includes('admin'),
    ).length;
    if (deactivatedAdminCount > 0) {
      const adminCountRows = await this.db
        .select({ cnt: sql<number>`count(*)` })
        .from(employee)
        .where(
          and(
            sql`'admin' = ANY(string_to_array(COALESCE(${employee.role}, ''), ','))`,
            eq(employee.status, true),
            isNull(employee.deletedAt),
          ),
        );
      if (Number(adminCountRows[0]?.cnt || 0) <= deactivatedAdminCount) {
        throw new BadRequestException(
          '系统中至少保留一个系统管理员，无法批量停用',
        );
      }
    }
    const roleSnapshots = new Map(
      await Promise.all(
        deactivatedIds.map(async (employeeId) => [
          employeeId,
          await this.roleManagerService.getUserRolesStrict(employeeId),
        ] as const),
      ),
    );

    const result = await this.db.transaction(async (tx) => {
      const idParams = sql.join(
        deactivatedIds.map((id) => sql`${id}`),
        sql`, `,
      );
      if (deactivatedAdminCount > 0) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY})`,
        );
        const adminCountRows = await tx
          .select({ cnt: sql<number>`count(*)` })
          .from(employee)
          .where(
            and(
              sql`'admin' = ANY(string_to_array(COALESCE(${employee.role}, ''), ','))`,
              eq(employee.status, true),
              isNull(employee.deletedAt),
            ),
          );
        if (Number(adminCountRows[0]?.cnt || 0) <= deactivatedAdminCount) {
          throw new BadRequestException(
            '系统中至少保留一个系统管理员，无法批量停用',
          );
        }
      }

      await tx.execute(sql`
        UPDATE ${employee}
        SET status = false
        WHERE (id).user_id IN (${idParams}) AND deleted_at IS NULL
      `);

      await tx.execute(sql`
        UPDATE ${employeeBinding}
        SET status = false
        WHERE (employee_id).user_id IN (${idParams})
          AND status = true
      `);

      for (const eId of deactivatedIds) {
        await tx.insert(auditLog).values({
          operatorId,
          action: 'deactivate_employee',
          targetType: 'employee',
          targetId: eId,
          changes: {
            before: {
              status: true,
              roleSnapshot: roleSnapshots.get(eId) || [],
            },
            after: { status: false },
          },
          reason: '批量停用员工',
        });
      }
      for (const employeeId of deactivatedIds) {
        await this.roleManagerService.syncUserRolesStrict(employeeId, []);
      }

      this.logger.log(
        `Batch deactivated ${deactivatedIds.length} employees: ${deactivatedIds.join(', ')}`,
      );

      return { success: true, deactivatedCount: deactivatedIds.length };
    });

    return result;
  }

  /**
   * 解绑 — 委托给 EmployeeBindingService.unbindById。
   */
  async deactivate(id: string, operatorId: string) {
    return this.bindingService.unbindById(id, operatorId);
  }

  /**
   * 获取员工详情 — Drizzle ORM 版本。
   */
  async getEmployee(id: string, userId: string) {
    await this.assertBindingView(userId);
    const canAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      id,
      { includeSelf: true },
    );
    if (!canAccess) {
      throw new ForbiddenException('无权查看该员工');
    }

    const result = await this.db
      .select({
        employeeId: sql<string>`(${employee.employeeId}).user_id`,
        name: employee.name,
        position: employee.position,
        department: employee.department,
        supervisorId: sql<string>`(employee.supervisor_id).user_id`,
        supervisorName: sql<string>`(SELECT sup.name FROM ${employee} sup
          WHERE (sup.employee_id).user_id = (employee.supervisor_id).user_id
            AND sup.deleted_at IS NULL
          LIMIT 1)`,
        status: employee.status,
        bindingId: employeeBinding.id,
        effectiveFrom: employeeBinding.effectiveFrom,
        templateId: assessmentTemplate.id,
        templateName: assessmentTemplate.name,
      })
      .from(employee)
      .leftJoin(
        employeeBinding,
        sql`(${employeeBinding.employeeId}).user_id = (${employee.employeeId}).user_id AND ${employeeBinding.status} = true`,
      )
      .leftJoin(
        assessmentTemplate,
        eq(employeeBinding.templateId, assessmentTemplate.id),
      )
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${id}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);

    if (result.length === 0) return null;

    const row = result[0];
    return {
      employeeId: row.employeeId,
      name: row.name,
      position: row.position,
      department: row.department,
      supervisorId: row.supervisorId || '',
      supervisorName: row.supervisorName || '',
      status: row.status,
      bindingId: row.bindingId || null,
      templateId: row.templateId || null,
      templateName: row.templateName || null,
      effectiveFrom: row.effectiveFrom || null,
    };
  }

  /**
   * 更新员工信息。
   */
  async updateEmployee(
    id: string,
    body: Record<string, unknown>,
    operatorId: string,
  ) {
    await this.assertEmployeeMutationScope(operatorId, id);

    const updateData: Record<string, unknown> = {};
    const fields = [
      'name',
      'position',
      'department',
      'supervisorId',
      'status',
      'employeeNo',
      'title',
      'phone',
      'hireDate',
      'probationMonths',
    ];

    for (const field of fields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) return { success: true };

    await this.db
      .update(employee)
      .set(updateData as Record<string, unknown>)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${id}`,
          isNull(employee.deletedAt),
        ),
      );

    await this.db.insert(auditLog).values({
      operatorId,
      action: 'update_employee',
      targetType: 'employee',
      targetId: id,
      changes: { after: updateData },
      reason: '编辑员工信息',
    });

    this.logger.log(`Updated employee: ${id}`);
    return { success: true };
  }

  /**
   * 绑定历史 — 委托给 EmployeeBindingService。
   */
  async history(employeeId: string, userId: string) {
    await this.assertBindingView(userId);
    const canAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      employeeId,
      { includeSelf: true },
    );
    if (!canAccess) {
      throw new ForbiddenException('无权查看该员工');
    }
    return this.bindingService.history(employeeId);
  }

  private async assertBindingView(userId: string): Promise<void> {
    const allowed = await this.roleManagerService.checkUserPermission(
      userId,
      'employee_binding',
      'view',
    );
    if (!allowed) {
      throw new ForbiddenException('无权查看员工绑定信息');
    }
  }

  private async assertEmployeeMutationScopes(
    userId: string,
    employeeIds: string[],
  ): Promise<void> {
    for (const employeeId of new Set(employeeIds)) {
      await this.assertEmployeeMutationScope(userId, employeeId);
    }
  }

  private async assertEmployeeMutationScope(
    userId: string,
    employeeId: string,
  ): Promise<void> {
    const canAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      employeeId,
      { includeSelf: true },
    );
    if (!canAccess) {
      throw new ForbiddenException('无权操作该员工');
    }
  }
}
