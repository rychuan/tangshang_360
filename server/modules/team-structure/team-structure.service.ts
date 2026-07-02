import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, isNull, like } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  employeeBinding,
  employee,
  assessmentTemplate,
  auditLog,
} from '@server/database/schema';
import { EmployeeBindingService } from '../employee-management/employee-binding.service';

@Injectable()
export class TeamStructureService {
  private readonly logger = new Logger(TeamStructureService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly bindingService: EmployeeBindingService,
  ) {}

  /**
   * 团队结构列表 — Drizzle ORM 版本，替代原原始 SQL 实现。
   */
  async list(query: {
    employeeName?: string;
    department?: string;
    position?: string;
    templateId?: string;
    page?: string;
    pageSize?: string;
  }) {
    const pageNum = parseInt(query.page || '1', 10);
    const pageSizeNum = parseInt(query.pageSize || '10', 10);
    const offset = (pageNum - 1) * pageSizeNum;

    const conditions = [
      eq(employee.status, 'active'),
      isNull(employee.deletedAt),
    ];

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

    const joinOn = sql`(${employeeBinding.employeeId}).user_id = (${employee.id}).user_id AND ${employeeBinding.status} = 'active'`;

    const [itemsResult, countResult] = await Promise.all([
      this.db
        .select({
          employeeId: sql<string>`(${employee.id}).user_id`,
          employeeName: employee.name,
          position: employee.position,
          department: employee.department,
          supervisorId: sql<string>`(${employee.supervisorId}).user_id`,
          supervisorName: sql<string>`(SELECT sup.name FROM ${employee} sup
            WHERE (sup.id).user_id = (${employee.supervisorId}).user_id
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

    const idParams = sql.join(
      employeeIds.map((id) => sql`${id}`),
      sql`, `,
    );

    // 批量更新仍需 raw SQL（Drizzle 对批量 IN 条件支持有限）
    await this.db.execute(sql`
      UPDATE ${employee}
      SET status = 'inactive'
      WHERE (id).user_id IN (${idParams}) AND deleted_at IS NULL
    `);

    await this.db.execute(sql`
      UPDATE ${employeeBinding}
      SET status = 'inactive'
      WHERE (employee_id).user_id IN (${idParams})
        AND status = 'active'
    `);

    for (const eId of employeeIds) {
      await this.db.insert(auditLog).values({
        operatorId,
        action: 'delete_employee',
        targetType: 'employee',
        targetId: eId,
        changes: {
          before: { status: 'active' },
          after: { status: 'inactive' },
        },
        reason: '批量删除员工',
      });
    }

    this.logger.log(
      `Batch deactivated ${employeeIds.length} employees: ${employeeIds.join(', ')}`,
    );

    return { success: true, deactivatedCount: employeeIds.length };
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
  async getEmployee(id: string) {
    const result = await this.db
      .select({
        employeeId: sql<string>`(${employee.id}).user_id`,
        name: employee.name,
        position: employee.position,
        department: employee.department,
        supervisorId: sql<string>`(${employee.supervisorId}).user_id`,
        supervisorName: sql<string>`(SELECT sup.name FROM ${employee} sup
          WHERE (sup.id).user_id = (${employee.supervisorId}).user_id
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
        sql`(${employeeBinding.employeeId}).user_id = (${employee.id}).user_id AND ${employeeBinding.status} = 'active'`,
      )
      .leftJoin(
        assessmentTemplate,
        eq(employeeBinding.templateId, assessmentTemplate.id),
      )
      .where(
        and(sql`(${employee.id}).user_id = ${id}`, isNull(employee.deletedAt)),
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
    const updateData: Record<string, unknown> = {};
    const fields = [
      'name',
      'position',
      'department',
      'supervisorId',
      'status',
      'employeeNo',
      'title',
      'role',
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
        and(sql`(${employee.id}).user_id = ${id}`, isNull(employee.deletedAt)),
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
  async history(employeeId: string) {
    return this.bindingService.history(employeeId);
  }
}
