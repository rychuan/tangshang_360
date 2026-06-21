import { Injectable, Logger, Inject, NotFoundException, ConflictException } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, like, count, desc, sql, inArray, isNull } from 'drizzle-orm';
import {
  employee,
  employeeBinding,
  assessmentInstance,
  assessmentTemplate,
  auditLog,
} from '@server/database/schema';
import type {
  EmployeeItem,
  EmployeeDetail,
  EmployeeListResponse,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  CreateBindingRequest,
  EmployeeBindingHistoryResponse,
  EmployeeCurrentBinding,
  BindingHistoryItem,
} from '@shared/api.interface';
import { DEFAULT_PERMISSIONS } from '@shared/api.interface';

@Injectable()
export class EmployeeManagementService {
  private readonly logger = new Logger(EmployeeManagementService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(query: {
    page: number;
    pageSize: number;
    keyword?: string;
    department?: string;
    positions?: string[];
    title?: string;
    role?: string;
    status?: string;
  }): Promise<EmployeeListResponse> {
    const conditions: ReturnType<typeof eq>[] = [isNull(employee.deletedAt)];

    if (query.keyword) {
      conditions.push(like(employee.name, `%${query.keyword}%`));
    }
    if (query.department) {
      conditions.push(eq(employee.department, query.department));
    }
    if (query.positions && query.positions.length > 0) {
      conditions.push(inArray(employee.position, query.positions));
    }
    if (query.title) {
      conditions.push(eq(employee.title, query.title));
    }
    if (query.role) {
      conditions.push(eq(employee.role, query.role));
    }
    if (query.status) {
      conditions.push(eq(employee.status, query.status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.pageSize;

    const [items, totalResult] = await Promise.all([
      this.db
        .select({
          id: employee.id,
          employeeNo: employee.employeeNo,
          name: employee.name,
          position: employee.position,
          title: employee.title,
          role: employee.role,
          department: employee.department,
          supervisorId: employee.supervisorId,
          status: employee.status,
          phone: employee.phone,
          hireDate: employee.hireDate,
          supervisorName: sql`COALESCE((SELECT sup.name FROM employee sup WHERE (sup.id).user_id = (${employee.supervisorId}).user_id AND sup.deleted_at IS NULL LIMIT 1), '')`,
        })
        .from(employee)
        .where(whereClause)
        .orderBy(desc(employee.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(employee)
        .where(whereClause),
    ]);

    const total = Number(totalResult[0]?.count || 0);

    const mapped: EmployeeItem[] = items.map((item) => ({
      id: String(item.id),
      employeeNo: item.employeeNo || '',
      name: item.name,
      position: item.position,
      title: item.title || '',
      role: (item.role || 'employee') as EmployeeItem['role'],
      department: item.department,
      supervisorId: item.supervisorId || '',
      supervisorName: String(item.supervisorName || ''),
      status: item.status as 'active' | 'inactive',
      phone: item.phone || '',
      hireDate: item.hireDate instanceof Date
        ? item.hireDate.toISOString()
        : item.hireDate || '',
    }));

    const employeeIds: string[] = mapped.map((m: EmployeeItem) => m.id);

    const bindingRows = employeeIds.length > 0
      ? await this.db
          .select({
            employeeId: employeeBinding.employeeId,
            bindingId: employeeBinding.id,
            templateId: employeeBinding.templateId,
            templateName: assessmentTemplate.name,
            effectiveFrom: employeeBinding.effectiveFrom,
            status: employeeBinding.status,
          })
          .from(employeeBinding)
          .innerJoin(
            assessmentTemplate,
            eq(employeeBinding.templateId, assessmentTemplate.id),
          )
          .where(
            and(
              inArray(employeeBinding.employeeId, employeeIds),
              eq(employeeBinding.status, 'active'),
            ),
          )
      : [];

    const bindingMap = new Map<string, EmployeeCurrentBinding>();
    for (const row of bindingRows) {
      bindingMap.set(String(row.employeeId), {
        bindingId: String(row.bindingId),
        templateId: String(row.templateId),
        templateName: row.templateName,
        effectiveFrom: row.effectiveFrom,
        status: row.status,
      });
    }

    const mappedWithBindings: EmployeeItem[] = mapped.map(
      (item: EmployeeItem) => ({
        ...item,
        currentBinding: bindingMap.get(item.id) ?? null,
      }),
    );

    return { items: mappedWithBindings, total };
  }

  async getPositions(): Promise<{ positions: string[] }> {
    const rows = await this.db
      .select({ position: employee.position })
      .from(employee)
      .where(isNull(employee.deletedAt))
      .orderBy(employee.position);
    const positions = [...new Set(rows.map((r) => r.position))];
    return { positions };
  }

  async delete(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select()
      .from(employee)
      .where(and(eq(employee.id, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    const emp = rows[0];

    await this.db
      .update(employee)
      .set({ deletedAt: new Date() })
      .where(eq(employee.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'delete_employee',
      targetType: 'employee',
      targetId: id,
      changes: { before: { name: emp.name, position: emp.position, department: emp.department } },
    });

    this.logger.log(`Employee deleted: ${emp.name} (${id})`);

    return { success: true };
  }

  async detail(id: string): Promise<EmployeeDetail> {
    const rows = await this.db
      .select()
      .from(employee)
      .where(and(eq(employee.id, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    const emp = rows[0];

    let supervisorName = '';
    if (emp.supervisorId) {
      const supRows = await this.db
        .select({ name: employee.name })
        .from(employee)
        .where(and(sql`(${employee.id}).user_id = ${emp.supervisorId}`, isNull(employee.deletedAt)))
        .limit(1);
      supervisorName = supRows.length > 0 ? supRows[0].name : '';
    }

    const [activeBindingRows, assessCountRows, completedRows, avgRows, latestGradeRows] = await Promise.all([
      this.db
        .select({ cnt: count() })
        .from(employeeBinding)
        .where(
          and(
            eq(employeeBinding.employeeId, id),
            eq(employeeBinding.status, 'active'),
          ),
        ),
      this.db
        .select({ cnt: count() })
        .from(assessmentInstance)
        .where(sql`(${assessmentInstance.employeeId}).user_id = ${id}`),
      this.db
        .select({ cnt: count() })
        .from(assessmentInstance)
        .where(
          and(
            sql`(${assessmentInstance.employeeId}).user_id = ${id}`,
            eq(assessmentInstance.status, 'completed'),
          ),
        ),
      this.db
        .select({ avgVal: sql`AVG(CAST(${assessmentInstance.totalScore} AS NUMERIC))` })
        .from(assessmentInstance)
        .where(
          and(
            sql`(${assessmentInstance.employeeId}).user_id = ${id}`,
            sql`${assessmentInstance.totalScore} IS NOT NULL`,
          ),
        ),
      this.db
        .select({ grade: assessmentInstance.grade })
        .from(assessmentInstance)
        .where(
          and(
            sql`(${assessmentInstance.employeeId}).user_id = ${id}`,
            eq(assessmentInstance.status, 'completed'),
            sql`${assessmentInstance.grade} IS NOT NULL`,
          ),
        )
        .orderBy(desc(assessmentInstance.completedAt))
        .limit(1),
    ]);

    return {
      id: String(emp.id),
      employeeNo: emp.employeeNo || '',
      name: emp.name,
      position: emp.position,
      title: emp.title || '',
      role: (emp.role || 'employee') as EmployeeDetail['role'],
      department: emp.department,
      supervisorId: emp.supervisorId || '',
      supervisorName,
      status: emp.status as 'active' | 'inactive',
      phone: emp.phone || '',
      hireDate: emp.hireDate instanceof Date
        ? emp.hireDate.toISOString()
        : emp.hireDate || '',
      probationMonths: emp.probationMonths || 3,
      createdAt: emp.createdAt instanceof Date
        ? emp.createdAt.toISOString()
        : String(emp.createdAt),
      stats: {
        activeBindings: Number(activeBindingRows[0]?.cnt || 0),
        totalAssessments: Number(assessCountRows[0]?.cnt || 0),
        completedAssessments: Number(completedRows[0]?.cnt || 0),
        avgScore: avgRows[0]?.avgVal != null
          ? Math.round(Number(avgRows[0].avgVal) * 100) / 100
          : undefined,
        latestGrade: latestGradeRows[0]?.grade || undefined,
      },
    };
  }

  async create(
    body: CreateEmployeeRequest,
    userId: string,
  ): Promise<{ id: string }> {
    const existing = await this.db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.id, body.id), isNull(employee.deletedAt)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('该用户已绑定员工档案');
    }

    const values = {
      id: body.id,
      name: body.name,
      position: body.position,
      title: body.title || null,
      role: body.role || 'employee',
      department: body.department || '',
      supervisorId: body.supervisorId || null,
      phone: body.phone || null,
      hireDate: body.hireDate ? new Date(body.hireDate) : null,
      probationMonths: body.probationMonths ?? 3,
      employeeNo: body.employeeNo || null,
    };

    const [inserted] = await this.db
      .insert(employee)
      .values(values)
      .returning({ id: employee.id });

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'create_employee',
      targetType: 'employee',
      targetId: String(inserted.id),
      changes: { after: values },
    });

    this.logger.log(`Employee created: ${body.name} (${inserted.id})`);

    return { id: String(inserted.id) };
  }

  async update(
    id: string,
    body: UpdateEmployeeRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.id, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    const values = {
      name: body.name,
      position: body.position,
      title: body.title || null,
      role: body.role || 'employee',
      department: body.department || '',
      supervisorId: body.supervisorId || null,
      phone: body.phone || null,
      hireDate: body.hireDate ? new Date(body.hireDate) : null,
      probationMonths: body.probationMonths ?? 3,
      employeeNo: body.employeeNo || null,
    };

    await this.db
      .update(employee)
      .set(values)
      .where(eq(employee.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'update_employee',
      targetType: 'employee',
      targetId: id,
      changes: { after: values },
    });

    this.logger.log(`Employee updated: ${id}`);

    return { success: true };
  }

  async activate(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.id, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    await this.db
      .update(employee)
      .set({ status: 'active' })
      .where(eq(employee.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'activate_employee',
      targetType: 'employee',
      targetId: id,
    });

    return { success: true };
  }

  async deactivate(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.id, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    await this.db
      .update(employee)
      .set({ status: 'inactive' })
      .where(eq(employee.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'deactivate_employee',
      targetType: 'employee',
      targetId: id,
    });

    return { success: true };
  }

  async getMyPermissions(userId: string) {
    const rows = await this.db
      .select({ role: employee.role, permissions: employee.permissions })
      .from(employee)
      .where(and(sql`(${employee.id}).user_id = ${userId}`, isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      return { role: 'employee', permissions: [] };
    }

    const emp = rows[0];
    const role = (emp.role as string) || 'employee';

    if (!emp.permissions) {
      return {
        role,
        permissions: (DEFAULT_PERMISSIONS as Record<string, unknown[]>)[role] || [],
      };
    }

    return {
      role,
      permissions: emp.permissions,
    };
  }

  async updatePermissions(
    employeeId: string,
    permissions: unknown[],
    operatorUserId: string,
  ): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: employee.id, role: employee.role, name: employee.name })
      .from(employee)
      .where(and(eq(employee.id, employeeId), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    await this.db
      .update(employee)
      .set({ permissions })
      .where(eq(employee.id, employeeId));

    await this.db.insert(auditLog).values({
      operatorId: operatorUserId,
      action: 'update_permissions',
      targetType: 'employee',
      targetId: employeeId,
      changes: { permissions },
      reason: `更新 ${rows[0].name} 的权限`,
    });

    this.logger.log(`Permissions updated for employee ${employeeId}`);

    return { success: true };
  }

  async validateAdminsExist(): Promise<number> {
    const rows = await this.db
      .select({ cnt: count() })
      .from(employee)
      .where(
        and(
          eq(employee.role, 'admin'),
          eq(employee.status, 'active'),
          isNull(employee.deletedAt),
        ),
      );
    return Number(rows[0]?.cnt || 0);
  }

  async bind(
    body: CreateBindingRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
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

      await this.db.insert(auditLog).values({
        operatorId: userId,
        action: 'bind',
        targetType: 'employee_binding',
        targetId: String(newBinding.id),
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
      `Created ${body.employeeIds.length} bindings for employees: ${body.employeeIds.join(', ')}`,
    );

    return { success: true };
  }

  async unbind(
    employeeId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const existing = await this.db
      .select({
        id: employeeBinding.id,
        status: employeeBinding.status,
      })
      .from(employeeBinding)
      .where(
        and(
          eq(employeeBinding.employeeId, employeeId),
          eq(employeeBinding.status, 'active'),
        ),
      );

    if (existing.length === 0) {
      this.logger.log(`No active binding found for employee: ${employeeId}`);
      return { success: true };
    }

    for (const binding of existing) {
      await this.db
        .update(employeeBinding)
        .set({ status: 'inactive' })
        .where(eq(employeeBinding.id, String(binding.id)));

      await this.db.insert(auditLog).values({
        operatorId: userId,
        action: 'unbind',
        targetType: 'employee_binding',
        targetId: String(binding.id),
        changes: {
          before: { status: binding.status },
          after: { status: 'inactive' },
        },
        reason: '员工解绑',
      });
    }

    this.logger.log(`Deactivated bindings for employee: ${employeeId}`);

    return { success: true };
  }

  async bindingHistory(
    employeeId: string,
  ): Promise<EmployeeBindingHistoryResponse> {
    const items = await this.db
      .select({
        templateName: assessmentTemplate.name,
        effectiveFrom: employeeBinding.effectiveFrom,
        status: employeeBinding.status,
        operatedByName: employee.name,
        operatedAt: employeeBinding.createdAt,
      })
      .from(employeeBinding)
      .innerJoin(
        assessmentTemplate,
        eq(employeeBinding.templateId, assessmentTemplate.id),
      )
      .leftJoin(
        employee,
        sql`(${employeeBinding.createdBy}).user_id = (${employee.id}).user_id`,
      )
      .where(eq(employeeBinding.employeeId, employeeId))
      .orderBy(desc(employeeBinding.createdAt));

    const mappedItems: BindingHistoryItem[] = items.map((item) => ({
      templateName: item.templateName,
      effectiveFrom: item.effectiveFrom,
      status: item.status,
      operatedBy: item.operatedByName || '',
      operatedAt:
        item.operatedAt instanceof Date
          ? item.operatedAt.toISOString()
          : String(item.operatedAt),
    }));

    return { items: mappedItems };
  }
}