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
  BindingTemplateOption,
  BindingHistoryItem,
} from '@shared/api.interface';
import { RoleManagerService } from '../role-manager/role-manager.service';
import { DEFAULT_PERMISSIONS } from '@shared/api.interface';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import { LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY } from './admin-safety';

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
    const canViewBindings = await this.roleManagerService.checkUserPermission(
      userId,
      'employee_binding',
      'view',
    );
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
    if (query.binding && !canViewBindings) {
      throw new ForbiddenException('无权筛选员工绑定状态');
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

    if (!canViewBindings) {
      return { items: mapped, total };
    }

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

  async bindingTemplates(): Promise<{ items: BindingTemplateOption[] }> {
    const rows = await this.db
      .select({
        id: assessmentTemplate.id,
        name: assessmentTemplate.name,
        position: assessmentTemplate.position,
        type: assessmentTemplate.type,
      })
      .from(assessmentTemplate)
      .where(
        and(
          eq(assessmentTemplate.isActive, true),
          isNull(assessmentTemplate.deletedAt),
        ),
      )
      .orderBy(assessmentTemplate.name);

    return {
      items: rows.map((row) => ({
        ...row,
        id: String(row.id),
        type: row.type as BindingTemplateOption['type'],
      })),
    };
  }

  async delete(id: string, userId: string): Promise<{ success: boolean }> {
    await this.assertEmployeeMutationScope(userId, id);

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
    if (emp.status && this.hasRole(emp.role, 'admin') && adminCount <= 1) {
      throw new BadRequestException('系统中至少保留一个系统管理员，无法删除');
    }

    await this.db.transaction(async (tx) => {
      // 事务内重新校验管理员数量
      if (emp.status && this.hasRole(emp.role, 'admin')) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY})`,
        );
        const adminCountRows = await tx
          .select({ cnt: count() })
          .from(employee)
          .where(
            and(
              this.adminRoleCondition(),
              eq(employee.status, true),
              isNull(employee.deletedAt),
            ),
          );
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
      await this.roleManagerService.syncUserRolesStrict(id, []);
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
    const canViewBindings = await this.roleManagerService.checkUserPermission(
      userId,
      'employee_binding',
      'view',
    );

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
      canViewBindings
        ? this.db
            .select({ cnt: count() })
            .from(employeeBinding)
            .where(
              and(
                eq(employeeBinding.employeeId, id),
                eq(employeeBinding.status, true),
              ),
            )
        : Promise.resolve([]),
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
        ...(canViewBindings
          ? { activeBindings: Number(activeBindingRows[0]?.cnt || 0) }
          : {}),
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
    options: { bitableConnectionId?: string } = {},
  ): Promise<{ id: string }> {
    await this.assertGlobalEmployeeScope(userId);
    if (
      body.role &&
      body.role.split(',').some((role) => role && role !== 'employee')
    ) {
      await this.assertRoleMutationPermission(
        userId,
        '只有系统管理员可修改员工角色',
        '无权修改员工角色',
      );
    }

    const existing = await this.db
      .select({
        id: employee.employeeId,
        deletedAt: employee.deletedAt,
      })
      .from(employee)
      .where(eq(employee.employeeId, body.id))
      .limit(1);

    if (existing.length > 0 && !existing[0].deletedAt) {
      throw new ConflictException('该用户已绑定员工档案');
    }

    // 自动解析 departmentId / positionCode
    const { departmentId, positionCode } = await this.resolveReferences(
      body.department,
      body.position,
      body.departmentId,
      body.positionCode,
    );

    const profileValues = {
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
      bitableConnectionId: options.bitableConnectionId || null,
    };

    const inserted = await this.db.transaction(async (tx) => {
      let row: { id: string };
      if (existing[0]) {
        await tx
          .update(employee)
          .set({
            ...profileValues,
            status: true,
            deletedAt: null,
          })
          .where(eq(employee.employeeId, body.id));
        row = { id: body.id };
      } else {
        [row] = await tx
          .insert(employee)
          .values({
            employeeId: body.id,
            ...profileValues,
          })
          .returning({ id: employee.employeeId });
      }
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: existing[0] ? 'restore_employee' : 'create_employee',
        targetType: 'employee',
        targetId: String(row.id),
        changes: { after: profileValues },
      });
      return row;
    });

    this.logger.log(`Employee created: ${body.name} (${inserted.id})`);

    // 同步角色到 AuthorizationSDK（事务外）
    const roles = (body.role || 'employee').split(',').filter(Boolean);
    await this.roleManagerService.syncUserRoles(body.id, roles);

    return { id: String(inserted.id) };
  }

  async syncImportedEmployee(
    id: string,
    body: UpdateEmployeeRequest,
    desiredStatus: boolean,
    userId: string,
  ): Promise<{ success: boolean }> {
    await this.assertEmployeeMutationScope(userId, id);

    const rows = await this.db
      .select({
        id: employee.employeeId,
        role: employee.role,
        status: employee.status,
      })
      .from(employee)
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    const currentRole = String(rows[0].role || 'employee');
    const nextRole = body.role || currentRole;
    const roleChanged = nextRole !== currentRole;
    if (roleChanged) {
      await this.assertRoleMutationPermission(
        userId,
        '只有系统管理员可修改员工角色',
        '无权修改员工角色',
      );
    }

    const removesActiveAdmin =
      rows[0].status &&
      this.hasRole(currentRole, 'admin') &&
      (!desiredStatus || !this.hasRole(nextRole, 'admin'));
    if (removesActiveAdmin && (await this.validateAdminsExist()) <= 1) {
      throw new BadRequestException(
        '系统中至少保留一个系统管理员，无法导入该变更',
      );
    }
    const deactivatesEmployee = rows[0].status && !desiredStatus;
    const roleSnapshot = deactivatesEmployee
      ? await this.roleManagerService.getUserRolesStrict(id)
      : null;
    const activatesEmployee = !rows[0].status && desiredStatus;
    const activationRoleSnapshot =
      activatesEmployee && !roleChanged
        ? await this.getLatestDeactivationRoleSnapshot(id)
        : null;
    let rolesToSync: string[] | null = null;
    if (!desiredStatus) {
      if (rows[0].status || roleChanged) {
        rolesToSync = [];
      }
    } else if (activatesEmployee) {
      rolesToSync =
        activationRoleSnapshot ?? this.parseRoles(nextRole);
    } else if (roleChanged) {
      rolesToSync = this.parseRoles(nextRole);
    }

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
      role: nextRole,
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
      status: desiredStatus,
    };

    await this.db.transaction(async (tx) => {
      if (removesActiveAdmin) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY})`,
        );
        const adminCountRows = await tx
          .select({ cnt: count() })
          .from(employee)
          .where(
            and(
              this.adminRoleCondition(),
              eq(employee.status, true),
              isNull(employee.deletedAt),
            ),
          );
        if (Number(adminCountRows[0]?.cnt || 0) <= 1) {
          throw new BadRequestException(
            '系统中至少保留一个系统管理员，无法导入该变更',
          );
        }
      }

      if (!desiredStatus) {
        await tx
          .update(employeeBinding)
          .set({ status: false })
          .where(
            and(
              eq(employeeBinding.employeeId, id),
              eq(employeeBinding.status, true),
            ),
          );
      }
      await tx.update(employee).set(values).where(eq(employee.employeeId, id));
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'import_update_employee',
        targetType: 'employee',
        targetId: id,
        changes: { after: values },
      });
      if (roleSnapshot) {
        await tx.insert(auditLog).values({
          operatorId: userId,
          action: 'deactivate_employee',
          targetType: 'employee',
          targetId: id,
          changes: {
            before: { status: true, roleSnapshot },
            after: { status: false },
          },
          reason: '多维表格导入停用员工',
        });
      }
      if (rolesToSync) {
        await this.roleManagerService.syncUserRolesStrict(id, rolesToSync);
      }
    });

    return { success: true };
  }

  async update(
    id: string,
    body: UpdateEmployeeRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    await this.assertEmployeeMutationScope(userId, id);

    const rows = await this.db
      .select({
        id: employee.employeeId,
        role: employee.role,
        status: employee.status,
      })
      .from(employee)
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }

    const currentRole = String(rows[0].role || 'employee');
    const nextRole = body.role || currentRole;
    const roleChanged = nextRole !== currentRole;
    const removesActiveAdmin =
      Boolean(rows[0].status) &&
      this.hasRole(currentRole, 'admin') &&
      !this.hasRole(nextRole, 'admin');
    if (roleChanged) {
      await this.assertRoleMutationPermission(
        userId,
        '只有系统管理员可修改员工角色',
        '无权修改员工角色',
      );
      if (removesActiveAdmin) {
        const adminCount = await this.validateAdminsExist();
        if (adminCount <= 1) {
          throw new BadRequestException(
            '系统中至少保留一个系统管理员，无法修改角色',
          );
        }
      }
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
      role: nextRole,
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
      if (removesActiveAdmin) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY})`,
        );
        const adminCountRows = await tx
          .select({ cnt: count() })
          .from(employee)
          .where(
            and(
              this.adminRoleCondition(),
              eq(employee.status, true),
              isNull(employee.deletedAt),
            ),
          );
        if (Number(adminCountRows[0]?.cnt || 0) <= 1) {
          throw new BadRequestException(
            '系统中至少保留一个系统管理员，无法修改角色',
          );
        }
      }
      await tx.update(employee).set(values).where(eq(employee.employeeId, id));
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'update_employee',
        targetType: 'employee',
        targetId: id,
        changes: { after: values },
      });
      if (roleChanged) {
        await this.roleManagerService.syncUserRolesStrict(
          id,
          this.parseRoles(nextRole),
        );
      }
    });

    this.logger.log(`Employee updated: ${id}`);

    return { success: true };
  }

  async activate(id: string, userId: string): Promise<{ success: boolean }> {
    await this.assertEmployeeMutationScope(userId, id);

    const rows = await this.db
      .select({
        id: employee.employeeId,
        role: employee.role,
        status: employee.status,
      })
      .from(employee)
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }
    const savedRoleSnapshot =
      await this.getLatestDeactivationRoleSnapshot(id);
    const rolesToRestore =
      savedRoleSnapshot ?? this.parseRoles(rows[0].role);

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
      await this.roleManagerService.syncUserRolesStrict(id, rolesToRestore);
    });

    return { success: true };
  }

  async deactivate(id: string, userId: string): Promise<{ success: boolean }> {
    await this.assertEmployeeMutationScope(userId, id);

    const rows = await this.db
      .select({
        id: employee.employeeId,
        role: employee.role,
        status: employee.status,
      })
      .from(employee)
      .where(and(eq(employee.employeeId, id), isNull(employee.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new NotFoundException('员工不存在');
    }
    if (!rows[0].status) {
      await this.roleManagerService.syncUserRolesStrict(id, []);
      return { success: true };
    }

    const isAdmin =
      this.hasRole(rows[0].role, 'admin');
    if (isAdmin && (await this.validateAdminsExist()) <= 1) {
      throw new BadRequestException('系统中至少保留一个系统管理员，无法停用');
    }
    const roleSnapshot =
      await this.roleManagerService.getUserRolesStrict(id);

    await this.db.transaction(async (tx) => {
      if (isAdmin) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(${LAST_ACTIVE_ADMIN_ADVISORY_LOCK_KEY})`,
        );
        const adminCountRows = await tx
          .select({ cnt: count() })
          .from(employee)
          .where(
            and(
              this.adminRoleCondition(),
              eq(employee.status, true),
              isNull(employee.deletedAt),
            ),
          );
        if (Number(adminCountRows[0]?.cnt || 0) <= 1) {
          throw new BadRequestException(
            '系统中至少保留一个系统管理员，无法停用',
          );
        }
      }
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
        changes: {
          before: { status: true, roleSnapshot },
          after: { status: false },
        },
      });
      await this.roleManagerService.syncUserRolesStrict(id, []);
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
    await this.assertEmployeeMutationScope(operatorUserId, employeeId);
    await this.assertRoleMutationPermission(
      operatorUserId,
      '只有系统管理员可修改员工权限',
      '无权修改员工权限',
    );

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
    if (this.hasRole(rows[0].role, 'admin')) {
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
          this.adminRoleCondition(),
          eq(employee.status, true),
          isNull(employee.deletedAt),
        ),
      );
    return Number(rows[0]?.cnt || 0);
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

  private async assertGlobalEmployeeScope(userId: string): Promise<void> {
    const scope = await this.accessScopeService.getScope(userId);
    if (scope.kind !== 'global') {
      throw new ForbiddenException('只有全局范围用户可创建员工');
    }
  }

  private async assertRoleMutationPermission(
    userId: string,
    identityMessage: string,
    permissionMessage: string,
  ): Promise<void> {
    const roles = await this.roleManagerService.getUserRoles(userId);
    if (!roles.includes('admin')) {
      throw new ForbiddenException(identityMessage);
    }
    const canEditPermissions =
      await this.roleManagerService.checkUserPermission(
        userId,
        'permission_management',
        'edit',
      );
    if (!canEditPermissions) {
      throw new ForbiddenException(permissionMessage);
    }
  }

  private parseRoles(role: string | null | undefined): string[] {
    const roles = String(role || 'employee')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return roles.length > 0 ? roles : ['employee'];
  }

  private hasRole(
    role: string | null | undefined,
    expectedRole: string,
  ): boolean {
    return this.parseRoles(role).includes(expectedRole);
  }

  private adminRoleCondition(): SQL {
    return sql`'admin' = ANY(string_to_array(COALESCE(${employee.role}, ''), ','))`;
  }

  private async getLatestDeactivationRoleSnapshot(
    employeeId: string,
  ): Promise<string[] | null> {
    const rows = await this.db
      .select({ changes: auditLog.changes })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'deactivate_employee'),
          eq(auditLog.targetType, 'employee'),
          eq(auditLog.targetId, employeeId),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(1);
    const changes = rows[0]?.changes as
      | { before?: { roleSnapshot?: unknown } }
      | null
      | undefined;
    const snapshot = changes?.before?.roleSnapshot;
    if (!Array.isArray(snapshot)) {
      return null;
    }
    return snapshot.filter(
      (role): role is string => typeof role === 'string' && role.length > 0,
    );
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
