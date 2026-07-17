import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import {
  eq,
  and,
  like,
  count,
  desc,
  sql,
  inArray,
  isNull,
  type SQL,
} from 'drizzle-orm';
import {
  employee,
  employeeBinding,
  assessmentInstance,
  assessmentTemplate,
  auditLog,
  department,
  systemDict,
} from '@server/database/schema';
import { EmployeeBindingService } from './employee-binding.service';
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
import { RoleManagerService } from '../role-manager/role-manager.service';
import { DEFAULT_PERMISSIONS } from '@shared/api.interface';
import { AccessScopeService } from '@server/common/access/access-scope.service';

@Injectable()
export class EmployeeManagementService {
  private readonly logger = new Logger(EmployeeManagementService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly roleManagerService: RoleManagerService,
    private readonly bindingService: EmployeeBindingService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  async list(
    query: {
      page: number;
      pageSize: number;
      keyword?: string;
      department?: string;
      positions?: string[];
      title?: string;
      role?: string;
      status?: string;
      binding?: string; // 'bound' | 'unbound'
    },
    userId: string,
  ): Promise<EmployeeListResponse> {
    const conditions: SQL[] = [isNull(employee.deletedAt)];
    const scopeCondition =
      await this.accessScopeService.buildEmployeeScopeCondition(userId, {
        includeSelf: true,
      });
    if (scopeCondition) {
      conditions.push(scopeCondition);
    }

    if (query.keyword) {
      conditions.push(like(employee.name, `%${query.keyword}%`));
    }
    if (query.department) {
      // 优先用 departmentId 匹配
      const deptRow = await this.db
        .select({ id: department.id })
        .from(department)
        .where(eq(department.name, query.department))
        .limit(1);
      if (deptRow[0]?.id) {
        conditions.push(eq(employee.departmentId, deptRow[0].id));
      } else {
        conditions.push(eq(employee.department, query.department));
      }
    }
    if (query.positions && query.positions.length > 0) {
      const dictRows = await this.db
        .select({ code: systemDict.code })
        .from(systemDict)
        .where(
          and(
            eq(systemDict.dictType, 'position'),
            inArray(systemDict.name, query.positions),
          ),
        );
      const codes = dictRows.map((d) => d.code).filter(Boolean);
      if (codes.length > 0) {
        conditions.push(inArray(employee.positionCode, codes));
      } else {
        conditions.push(inArray(employee.position, query.positions));
      }
    }
    if (query.title) {
      conditions.push(eq(employee.title, query.title));
    }
    if (query.role) {
      conditions.push(eq(employee.role, query.role));
    }
    if (query.status === 'true' || query.status === 'false') {
      conditions.push(eq(employee.status, query.status === 'true'));
    }
    if (query.binding === 'bound') {
      conditions.push(
        sql`EXISTS (SELECT 1 FROM ${employeeBinding} WHERE (${employeeBinding.employeeId}).user_id = (${employee.employeeId}).user_id AND ${employeeBinding.status} = true)`,
      );
    } else if (query.binding === 'unbound') {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM ${employeeBinding} WHERE (${employeeBinding.employeeId}).user_id = (${employee.employeeId}).user_id AND ${employeeBinding.status} = true)`,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (query.page - 1) * query.pageSize;

    const [items, totalResult] = await Promise.all([
      this.db
        .select({
          id: employee.employeeId,
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
          supervisorName: sql`COALESCE((SELECT sup.name FROM employee sup WHERE (sup.employee_id).user_id = (employee.supervisor_id).user_id AND sup.deleted_at IS NULL LIMIT 1), '')`,
          bitableConnectionId: employee.bitableConnectionId,
        })
        .from(employee)
        .where(whereClause)
        .orderBy(desc(employee.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db.select({ count: count() }).from(employee).where(whereClause),
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
      status: item.status,
      phone: item.phone || '',
      hireDate:
        item.hireDate instanceof Date
          ? item.hireDate.toISOString()
          : item.hireDate || '',
      bitableConnectionId: item.bitableConnectionId || null,
    }));

    const employeeIds: string[] = mapped.map((m: EmployeeItem) => m.id);

    const bindingRows =
      employeeIds.length > 0
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
                eq(employeeBinding.status, true),
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
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    const emp = rows[0];

    // P0-2: 防止删除最后一个管理员
    const adminCount = await this.validateAdminsExist();
    if (String(emp.role || 'employee') === 'admin' && adminCount <= 1) {
      throw new BadRequestException('系统中至少保留一个系统管理员，无法删除');
    }

    await this.db.transaction(async (tx) => {
      // 事务内重新校验管理员数量
      if (String(emp.role || 'employee') === 'admin') {
        const adminCountRows = await tx
          .select({ cnt: count() })
          .from(employee)
          .where(and(eq(employee.role, 'admin'), isNull(employee.deletedAt)));
        if (Number(adminCountRows[0]?.cnt || 0) <= 1) {
          throw new BadRequestException(
            '系统中至少保留一个系统管理员，无法删除',
          );
        }
      }
      await tx
        .update(employee)
        .set({ deletedAt: new Date() })
        .where(eq(employee.employeeId, id));
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'delete_employee',
        targetType: 'employee',
        targetId: id,
        changes: {
          before: {
            name: emp.name,
            position: emp.position,
            department: emp.department,
          },
        },
      });
    });

    this.logger.log(`Employee deleted: ${emp.name} (${id})`);

    return { success: true };
  }

  async detail(id: string, userId: string): Promise<EmployeeDetail> {
    const canAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      id,
      { includeSelf: true },
    );
    if (!canAccess) {
      throw new ForbiddenException('无权查看该员工');
    }

    const rows = await this.db
      .select({
        employeeId: employee.employeeId,
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
        probationMonths: employee.probationMonths,
        createdAt: employee.createdAt,
        permissions: employee.permissions,
        supervisorName: sql<string>`COALESCE((SELECT sup.name FROM employee sup WHERE (sup.employee_id).user_id = (employee.supervisor_id).user_id AND sup.deleted_at IS NULL LIMIT 1), '')`,
      })
      .from(employee)
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    const emp = rows[0];

    const [
      activeBindingRows,
      assessCountRows,
      completedRows,
      avgRows,
      latestGradeRows,
    ] = await Promise.all([
      this.db
        .select({ cnt: count() })
        .from(employeeBinding)
        .where(
          and(
            eq(employeeBinding.employeeId, id),
            eq(employeeBinding.status, true),
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
        .select({
          avgVal: sql`AVG(CAST(${assessmentInstance.totalScore} AS NUMERIC))`,
        })
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
      id: String(emp.employeeId),
      employeeNo: emp.employeeNo || '',
      name: emp.name,
      position: emp.position,
      title: emp.title || '',
      role: (emp.role || 'employee') as EmployeeDetail['role'],
      department: emp.department,
      supervisorId: emp.supervisorId || '',
      supervisorName: emp.supervisorName || '',
      status: emp.status,
      phone: emp.phone || '',
      hireDate:
        emp.hireDate instanceof Date
          ? emp.hireDate.toISOString()
          : emp.hireDate || '',
      probationMonths: emp.probationMonths || 3,
      createdAt:
        emp.createdAt instanceof Date
          ? emp.createdAt.toISOString()
          : String(emp.createdAt),
      stats: {
        activeBindings: Number(activeBindingRows[0]?.cnt || 0),
        totalAssessments: Number(assessCountRows[0]?.cnt || 0),
        completedAssessments: Number(completedRows[0]?.cnt || 0),
        avgScore:
          avgRows[0]?.avgVal != null
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
      .select({ id: employee.employeeId })
      .from(employee)
      .where(and(eq(employee.employeeId, body.id), isNull(employee.deletedAt)))
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictException('该用户已绑定员工档案');
    }

    // 自动解析 departmentId / positionCode
    const { departmentId, positionCode } = await this.resolveReferences(
      body.department,
      body.position,
      body.departmentId,
      body.positionCode,
    );

    const values = {
      employeeId: body.id,
      name: body.name,
      position: body.position,
      positionCode,
      title: body.title || null,
      role: body.role || 'employee',
      department: body.department || '',
      departmentId,
      supervisorId: await this.resolveSupervisor(
        body.supervisorId,
        body.department,
      ),
      phone: body.phone || null,
      hireDate: body.hireDate ? new Date(body.hireDate) : null,
      probationMonths: body.probationMonths ?? 3,
      employeeNo: body.employeeNo || null,
    };

    const [inserted] = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(employee)
        .values(values)
        .returning({ id: employee.employeeId });
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'create_employee',
        targetType: 'employee',
        targetId: String(row.id),
        changes: { after: values },
      });
      return [row];
    });

    this.logger.log(`Employee created: ${body.name} (${inserted.id})`);

    // 同步角色到 AuthorizationSDK（事务外）
    const roles = (body.role || 'employee').split(',').filter(Boolean);
    await this.roleManagerService.syncUserRoles(body.id, roles);

    return { id: String(inserted.id) };
  }

  async update(
    id: string,
    body: UpdateEmployeeRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: employee.employeeId })
      .from(employee)
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    // 自动解析 departmentId / positionCode
    const { departmentId, positionCode } = await this.resolveReferences(
      body.department,
      body.position,
      body.departmentId,
      body.positionCode,
    );

    const values = {
      name: body.name,
      position: body.position,
      positionCode,
      title: body.title || null,
      role: body.role || 'employee',
      department: body.department || '',
      departmentId,
      supervisorId: await this.resolveSupervisor(
        body.supervisorId,
        body.department,
      ),
      phone: body.phone || null,
      hireDate: body.hireDate ? new Date(body.hireDate) : null,
      probationMonths: body.probationMonths ?? 3,
      employeeNo: body.employeeNo || null,
    };

    await this.db.transaction(async (tx) => {
      await tx.update(employee).set(values).where(eq(employee.employeeId, id));
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'update_employee',
        targetType: 'employee',
        targetId: id,
        changes: { after: values },
      });
    });

    this.logger.log(`Employee updated: ${id}`);

    // 同步角色到 AuthorizationSDK
    const newRoles = (body.role || 'employee').split(',').filter(Boolean);
    await this.roleManagerService.syncUserRoles(id, newRoles);

    return { success: true };
  }

  async activate(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: employee.employeeId })
      .from(employee)
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(employee)
        .set({ status: true })
        .where(eq(employee.employeeId, id));
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'activate_employee',
        targetType: 'employee',
        targetId: id,
      });
    });

    return { success: true };
  }

  async deactivate(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: employee.employeeId })
      .from(employee)
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    await this.db.transaction(async (tx) => {
      // P1-1: 停用员工时联动停用其所有活跃绑定
      await tx
        .update(employeeBinding)
        .set({ status: false })
        .where(
          and(
            eq(employeeBinding.employeeId, id),
            eq(employeeBinding.status, true),
          ),
        );
      await tx
        .update(employee)
        .set({ status: false })
        .where(eq(employee.employeeId, id));
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'deactivate_employee',
        targetType: 'employee',
        targetId: id,
      });
    });

    return { success: true };
  }

  async getMyPermissions(userId: string) {
    const rows = await this.db
      .select({ role: employee.role, permissions: employee.permissions })
      .from(employee)
      .where(
        and(
          sql`(${employee.employeeId}).user_id = ${userId}`,
          isNull(employee.deletedAt),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return { role: 'employee', permissions: [] };
    }

    const emp = rows[0];
    const role = (emp.role as string) || 'employee';

    if (!emp.permissions) {
      return {
        role,
        permissions:
          (DEFAULT_PERMISSIONS as Record<string, unknown[]>)[role] || [],
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
      .select({
        id: employee.employeeId,
        role: employee.role,
        name: employee.name,
      })
      .from(employee)
      .where(
        and(eq(employee.employeeId, employeeId), isNull(employee.deletedAt)),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    // 防止移除最后一个管理员的权限
    if (String(rows[0].role || 'employee') === 'admin') {
      const adminCount = await this.validateAdminsExist();
      if (adminCount <= 1) {
        throw new BadRequestException(
          '系统中至少保留一个系统管理员，无法移除其权限',
        );
      }
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(employee)
        .set({ permissions })
        .where(eq(employee.employeeId, employeeId));
      await tx.insert(auditLog).values({
        operatorId: operatorUserId,
        action: 'update_permissions',
        targetType: 'employee',
        targetId: employeeId,
        changes: { permissions },
        reason: `更新 ${rows[0].name} 的权限`,
      });
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
          eq(employee.status, true),
          isNull(employee.deletedAt),
        ),
      );
    return Number(rows[0]?.cnt || 0);
  }
  /**
   * 解析上级：优先使用指定的 supervisorId，否则根据部门查找部门负责人
   */
  private async resolveReferences(
    deptName?: string,
    posName?: string,
    explicitDepartmentId?: string | null,
    explicitPositionCode?: string | null,
  ) {
    let departmentId: string | null = explicitDepartmentId ?? null;
    let positionCode: string | null = explicitPositionCode ?? null;

    if (!departmentId && deptName) {
      const deptRow = await this.db
        .select({ id: department.id })
        .from(department)
        .where(eq(department.name, deptName))
        .limit(1);
      departmentId = deptRow[0]?.id ?? null;
    }
    if (!positionCode && posName) {
      const dictRow = await this.db
        .select({ code: systemDict.code })
        .from(systemDict)
        .where(
          and(
            eq(systemDict.dictType, 'position'),
            eq(systemDict.name, posName),
          ),
        )
        .limit(1);
      positionCode = dictRow[0]?.code ?? null;
    }

    return { departmentId, positionCode };
  }

  private async resolveSupervisor(
    supervisorId?: string,
    departmentName?: string,
  ): Promise<string | null> {
    if (supervisorId) return supervisorId;
    if (departmentName) {
      const deptRows = await this.db
        .select({ headId: department.headId })
        .from(department)
        .where(
          and(
            eq(department.name, departmentName),
            eq(department.isActive, true),
          ),
        )
        .limit(1);
      if (deptRows.length > 0 && deptRows[0].headId) {
        this.logger.log(
          `Auto-resolved supervisor from department "${departmentName}" head`,
        );
        return deptRows[0].headId;
      }
    }
    return null;
  }

  async bind(
    body: CreateBindingRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    await this.bindingService.batchBind(
      body.employeeIds,
      body.templateId,
      body.effectiveFrom,
      userId,
    );
    return { success: true };
  }

  async unbind(
    employeeId: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    return this.bindingService.unbind(employeeId, userId);
  }

  async bindingHistory(
    employeeId: string,
    userId: string,
  ): Promise<EmployeeBindingHistoryResponse> {
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
}
