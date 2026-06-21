import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  employeeBinding,
  employee,
  assessmentTemplate,
  auditLog,
} from '@server/database/schema';

@Injectable()
export class TeamStructureService {
  private readonly logger = new Logger(TeamStructureService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(query: {
    employeeName?: string;
    department?: string;
    position?: string;
    templateId?: string;
    page?: string;
    pageSize?: string;
  }) {
    const pageNum: number = parseInt(query.page || '1', 10);
    const pageSizeNum: number = parseInt(query.pageSize || '10', 10);
    const offset: number = (pageNum - 1) * pageSizeNum;

    const whereParts: ReturnType<typeof sql>[] = [
      sql`e.status = 'active'`,
      sql`e.deleted_at IS NULL`,
    ];

    if (query.employeeName) {
      whereParts.push(
        sql`e.name ILIKE ${`%${query.employeeName}%`}`,
      );
    }
    if (query.department) {
      whereParts.push(
        sql`e.department ILIKE ${`%${query.department}%`}`,
      );
    }
    if (query.position) {
      whereParts.push(
        sql`e.position ILIKE ${`%${query.position}%`}`,
      );
    }
    if (query.templateId) {
      whereParts.push(
        sql`t.id = ${query.templateId}::uuid`,
      );
    }

    const whereClause = sql`WHERE ${sql.join(whereParts, sql` AND `)}`;

    const baseFrom = sql`
      FROM employee e
      LEFT JOIN employee_binding eb
        ON (eb.employee_id).user_id = (e.id).user_id AND eb.status = 'active'
      LEFT JOIN assessment_template t ON eb.template_id = t.id
    `;

    const [itemsResult, countResult] = await Promise.all([
      this.db.execute(sql`
        SELECT
          (e.id).user_id AS employee_id,
          e.name AS employee_name,
          e.position,
          e.department,
          (e.supervisor_id).user_id AS supervisor_id,
          (SELECT name FROM employee sup
            WHERE (sup.id).user_id = (e.supervisor_id).user_id AND sup.deleted_at IS NULL
            LIMIT 1) AS supervisor_name,
          eb.id AS binding_id,
          eb.effective_from,
          eb.status AS binding_status,
          t.id AS template_id,
          t.name AS template_name
        ${baseFrom}
        ${whereClause}
        ORDER BY e.name ASC
        LIMIT ${pageSizeNum} OFFSET ${offset}
      `),
      this.db.execute(sql`
        SELECT COUNT(*) as total
        ${baseFrom}
        ${whereClause}
      `),
    ]);

    const total: number = parseInt(
      String(countResult[0]?.total || 0),
      10,
    );

    const mappedItems = itemsResult.map(
      (row: Record<string, unknown>) => ({
        employeeId: String(row.employee_id),
        employeeName: String(row.employee_name),
        department: String(row.department),
        position: String(row.position),
        supervisorId: String(row.supervisor_id || ''),
        supervisorName: String(row.supervisor_name || ''),
        templateId: row.template_id
          ? String(row.template_id)
          : null,
        templateName: row.template_name
          ? String(row.template_name)
          : null,
        bindingId: row.binding_id
          ? String(row.binding_id)
          : null,
        effectiveFrom: row.effective_from
          ? String(row.effective_from)
          : null,
        bindingStatus: row.binding_status
          ? String(row.binding_status)
          : null,
      }),
    );

    return { items: mappedItems, total };
  }

  async create(
    body: {
      employeeIds: string[];
      templateId: string;
      effectiveFrom: string;
    },
    operatorId: string,
  ) {
    const results: string[] = [];

    for (const eId of body.employeeIds) {
      const existing = await this.db
        .select({ id: employeeBinding.id })
        .from(employeeBinding)
        .where(
          and(
            eq(employeeBinding.employeeId, eId),
            eq(employeeBinding.status, 'active'),
          ),
        );

      if (existing.length > 0) {
        await this.db
          .update(employeeBinding)
          .set({ status: 'inactive' })
          .where(eq(employeeBinding.employeeId, eId));
        this.logger.log(
          `Deactivated existing bindings for employee: ${eId}`,
        );
      }

      const [newBinding] = await this.db
        .insert(employeeBinding)
        .values({
          employeeId: eId,
          templateId: body.templateId,
          effectiveFrom: body.effectiveFrom,
          status: 'active',
        })
        .returning();

      results.push(newBinding.id);

      await this.db.insert(auditLog).values({
        operatorId,
        action: 'bind',
        targetType: 'employee_binding',
        targetId: newBinding.id,
        changes: {
          after: {
            templateId: body.templateId,
            effectiveFrom: body.effectiveFrom,
          },
        },
        reason: '员工模板绑定',
      });
    }

    this.logger.log(
      `Created ${results.length} bindings for employees: ${body.employeeIds.join(', ')}`,
    );

    return { success: true, ids: results };
  }

  async batchDeactivate(employeeIds: string[], operatorId: string) {
    if (employeeIds.length === 0) {
      return { success: true, deactivatedCount: 0 };
    }

    const idParams = sql.join(
      employeeIds.map((id: string) => sql`${id}`),
      sql`, `,
    );

    await this.db.execute(sql`
      UPDATE employee
      SET status = 'inactive'
      WHERE (id).user_id IN (${idParams}) AND deleted_at IS NULL
    `);

    await this.db.execute(sql`
      UPDATE employee_binding
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

  async deactivate(id: string, operatorId: string) {
    const [existing] = await this.db
      .select({
        id: employeeBinding.id,
        status: employeeBinding.status,
      })
      .from(employeeBinding)
      .where(eq(employeeBinding.id, id));

    if (!existing) {
      this.logger.log(`Binding not found: ${id}`);
      return { success: false, message: '绑定记录不存在' };
    }

    await this.db
      .update(employeeBinding)
      .set({ status: 'inactive' })
      .where(eq(employeeBinding.id, id));

    await this.db.insert(auditLog).values({
      operatorId,
      action: 'unbind',
      targetType: 'employee_binding',
      targetId: id,
      changes: {
        before: { status: existing.status },
        after: { status: 'inactive' },
      },
      reason: '员工解绑',
    });

    this.logger.log(`Deactivated binding: ${id}`);

    return { success: true };
  }

  async getEmployee(id: string) {
    const result = await this.db.execute(sql`
      SELECT
        (e.id).user_id AS employee_id,
        e.name,
        e.position,
        e.department,
        (e.supervisor_id).user_id AS supervisor_id,
        (SELECT name FROM employee sup
          WHERE (sup.id).user_id = (e.supervisor_id).user_id AND sup.deleted_at IS NULL
          LIMIT 1) AS supervisor_name,
        e.status,
        eb.id AS binding_id,
        eb.effective_from,
        t.id AS template_id,
        t.name AS template_name
      FROM employee e
      LEFT JOIN employee_binding eb
        ON (eb.employee_id).user_id = (e.id).user_id AND eb.status = 'active'
      LEFT JOIN assessment_template t ON eb.template_id = t.id
      WHERE (e.id).user_id = ${id} AND e.deleted_at IS NULL
    `);

    if (result.length === 0) {
      return null;
    }

    const row: Record<string, unknown> = result[0];
    return {
      employeeId: String(row.employee_id),
      name: String(row.name),
      position: String(row.position),
      department: String(row.department),
      supervisorId: String(row.supervisor_id || ''),
      supervisorName: String(row.supervisor_name || ''),
      status: String(row.status),
      bindingId: row.binding_id ? String(row.binding_id) : null,
      templateId: row.template_id ? String(row.template_id) : null,
      templateName: row.template_name ? String(row.template_name) : null,
      effectiveFrom: row.effective_from ? String(row.effective_from) : null,
    };
  }

  async updateEmployee(
    id: string,
    body: {
      name?: string;
      position?: string;
      department?: string;
      supervisorId?: string;
      status?: string;
      employeeNo?: string;
      title?: string;
      role?: string;
      phone?: string;
      hireDate?: string;
      probationMonths?: number;
    },
    operatorId: string,
  ) {
    const beforeChanges: Record<string, unknown> = {};
    const updateData: Record<string, unknown> = {};

    const fieldsToUpdate = [
      'name', 'position', 'department', 'supervisorId', 'status',
      'employeeNo', 'title', 'role', 'phone', 'hireDate', 'probationMonths',
    ] as const;

    for (const field of fieldsToUpdate) {
      if ((body as Record<string, unknown>)[field] !== undefined) {
        updateData[field] = (body as Record<string, unknown>)[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { success: true };
    }

    await this.db
      .update(employee)
      .set(updateData as Record<string, unknown>)
      .where(and(sql`(${employee.id}).user_id = ${id}`, isNull(employee.deletedAt)));

    await this.db.insert(auditLog).values({
      operatorId,
      action: 'update_employee',
      targetType: 'employee',
      targetId: id,
      changes: {
        before: beforeChanges,
        after: updateData,
      },
      reason: '编辑员工信息',
    });

    this.logger.log(`Updated employee: ${id}`);

    return { success: true };
  }

  async history(employeeId: string) {
    const items = await this.db
      .select({
        templateName: assessmentTemplate.name,
        effectiveFrom: employeeBinding.effectiveFrom,
        status: employeeBinding.status,
        operatedBy: employeeBinding.createdBy,
        operatedAt: employeeBinding.createdAt,
      })
      .from(employeeBinding)
      .innerJoin(
        assessmentTemplate,
        eq(employeeBinding.templateId, assessmentTemplate.id),
      )
      .where(eq(employeeBinding.employeeId, employeeId))
      .orderBy(desc(employeeBinding.createdAt));

    const mappedItems = items.map((item) => ({
      templateName: item.templateName,
      effectiveFrom: item.effectiveFrom,
      status: item.status,
      operatedBy: item.operatedBy || '',
      operatedAt:
        item.operatedAt instanceof Date
          ? item.operatedAt.toISOString()
          : String(item.operatedAt),
    }));

    return { items: mappedItems };
  }
}