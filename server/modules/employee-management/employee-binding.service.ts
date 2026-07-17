import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, isNull, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  employee,
  employeeBinding,
  assessmentTemplate,
  auditLog,
} from '@server/database/schema';
import { EmployeeSnapshotService } from '../employee-snapshot/employee-snapshot.service';
import { AccessScopeService } from '@server/common/access/access-scope.service';
import type {
  BindingHistoryItem,
  EmployeeBindingHistoryResponse,
} from '@shared/api.interface';

/**
 * 统一的员工-模板绑定服务，供 EmployeeManagement 和 TeamStructure 等模块共用。
 * 消除了原先两处重复的绑定/解绑/历史逻辑。
 */
@Injectable()
export class EmployeeBindingService {
  private readonly logger = new Logger(EmployeeBindingService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly employeeSnapshotService: EmployeeSnapshotService,
    private readonly accessScopeService: AccessScopeService,
  ) {}

  /**
   * 绑定单个员工到指定模板。
   * 逻辑：验证模板存在 → 停用旧绑定 → 创建新绑定 → 管理快照 → 写审计日志。
   */
  async bind(
    employeeId: string,
    templateId: string,
    effectiveFrom: string,
    userId: string,
  ): Promise<{ bindingId: string }> {
    if (!this.isValidPeriod(effectiveFrom)) {
      throw new BadRequestException(
        `生效期间格式错误（应为 YYYY-MM）：${effectiveFrom}`,
      );
    }
    await this.assertEmployeeScope(userId, employeeId);

    const tplRows = await this.db
      .select({
        id: assessmentTemplate.id,
        isActive: assessmentTemplate.isActive,
      })
      .from(assessmentTemplate)
      .where(eq(assessmentTemplate.id, templateId))
      .limit(1);
    if (tplRows.length === 0) {
      throw new NotFoundException(`考核模板 ${templateId} 不存在`);
    }
    if (!tplRows[0].isActive) {
      throw new BadRequestException(
        `考核模板「${templateId}」已停用，无法绑定`,
      );
    }

    const empRows = await this.db
      .select({ id: employee.employeeId })
      .from(employee)
      .where(
        and(eq(employee.employeeId, employeeId), isNull(employee.deletedAt)),
      )
      .limit(1);
    if (empRows.length === 0) {
      throw new NotFoundException(`员工 ${employeeId} 不存在`);
    }

    const existing = await this.db
      .select({
        id: employeeBinding.id,
        templateId: employeeBinding.templateId,
      })
      .from(employeeBinding)
      .where(
        and(
          eq(employeeBinding.employeeId, employeeId),
          eq(employeeBinding.status, true),
        ),
      );

    const oldTemplateId: string | null =
      existing.length > 0 ? existing[0].templateId : null;

    return this.db
      .transaction(async (tx) => {
        if (existing.length > 0) {
          await tx
            .update(employeeBinding)
            .set({ status: false })
            .where(eq(employeeBinding.employeeId, employeeId));
          this.logger.log(
            `Deactivated existing bindings for employee: ${employeeId}`,
          );
        }

        const [newBinding] = await tx
          .insert(employeeBinding)
          .values({
            employeeId,
            templateId,
            effectiveFrom,
            status: true,
          })
          .returning();

        if (!newBinding) {
          throw new InternalServerErrorException('创建绑定记录失败');
        }

        await tx.insert(auditLog).values({
          operatorId: userId,
          action: 'bind',
          targetType: 'employee_binding',
          targetId: String(newBinding.id),
          changes: {
            after: { templateId, effectiveFrom },
          },
          reason: '员工模板绑定',
        });

        return { bindingId: newBinding.id };
      })
      .then(async (result) => {
        // 快照操作在事务提交后执行（避免事务过长），
        // 快照失败不回滚绑定（绑定是核心数据，快照可重生成）
        if (oldTemplateId !== templateId) {
          await this.employeeSnapshotService.deleteSnapshot(employeeId);
          await this.employeeSnapshotService.generateFromTemplate(
            employeeId,
            templateId,
            userId,
          );
        } else {
          const hasSnap =
            await this.employeeSnapshotService.hasSnapshot(employeeId);
          if (!hasSnap) {
            await this.employeeSnapshotService.generateFromTemplate(
              employeeId,
              templateId,
              userId,
            );
          }
        }
        return result;
      });
  }

  /**
   * 批量绑定员工到指定模板，返回所有新建绑定 ID。
   */
  async batchBind(
    employeeIds: string[],
    templateId: string,
    effectiveFrom: string,
    userId: string,
  ): Promise<{ ids: string[] }> {
    if (!this.isValidPeriod(effectiveFrom)) {
      throw new BadRequestException(
        `生效期间格式错误（应为 YYYY-MM）：${effectiveFrom}`,
      );
    }
    if (employeeIds.length === 0) return { ids: [] };
    await this.assertEmployeeScopes(userId, employeeIds);

    // 1. 批量验证模板
    const tplRows = await this.db
      .select({
        id: assessmentTemplate.id,
        isActive: assessmentTemplate.isActive,
      })
      .from(assessmentTemplate)
      .where(eq(assessmentTemplate.id, templateId))
      .limit(1);
    if (tplRows.length === 0)
      throw new NotFoundException(`考核模板 ${templateId} 不存在`);
    if (!tplRows[0].isActive) throw new BadRequestException(`考核模板已停用`);

    // 2. 批量验证员工存在
    const empRows = await this.db
      .select({ employeeId: employee.employeeId })
      .from(employee)
      .where(
        and(
          inArray(employee.employeeId, employeeIds),
          isNull(employee.deletedAt),
        ),
      );
    const validIds = new Set(empRows.map((e) => String(e.employeeId)));
    const invalidIds = employeeIds.filter((id) => !validIds.has(id));
    if (invalidIds.length > 0)
      throw new NotFoundException(`员工不存在：${invalidIds.join(', ')}`);

    // 3. 批量查现有绑定
    const existingBindings = await this.db
      .select()
      .from(employeeBinding)
      .where(
        and(
          inArray(employeeBinding.employeeId, employeeIds),
          eq(employeeBinding.status, true),
        ),
      );

    // 4. 单个事务：停旧→插新→日志
    const ids = await this.db.transaction(async (tx) => {
      if (existingBindings.length > 0) {
        await tx
          .update(employeeBinding)
          .set({ status: false })
          .where(inArray(employeeBinding.employeeId, employeeIds));
      }
      const inserted = await tx
        .insert(employeeBinding)
        .values(
          employeeIds.map((eId) => ({
            employeeId: eId,
            templateId,
            effectiveFrom,
            status: true,
          })),
        )
        .returning();
      if (inserted.length > 0) {
        await tx.insert(auditLog).values(
          inserted.map((b) => ({
            operatorId: userId,
            action: 'bind',
            targetType: 'employee_binding',
            targetId: String(b.id),
            changes: { after: { templateId, effectiveFrom } },
            reason: '员工模板批量绑定',
          })),
        );
      }
      return inserted.map((b) => String(b.id));
    });

    // 5. 快照并行处理（事务外）
    await Promise.allSettled(
      employeeIds.map((eId) =>
        this.employeeSnapshotService
          .deleteSnapshot(eId)
          .then(() =>
            this.employeeSnapshotService.generateFromTemplate(
              eId,
              templateId,
              userId,
            ),
          )
          .catch((err) =>
            this.logger.warn(`Snapshot failed for ${eId}: ${err}`),
          ),
      ),
    );

    this.logger.log(
      `Batch bind: ${ids.length} employees to template ${templateId}`,
    );
    return { ids };
  }

  /**
   * 按员工 ID 解绑所有活跃绑定。
   */
  async unbind(
    employeeId: string,
    userId: string,
    deleteSnapshot: boolean = false,
  ): Promise<{ success: boolean }> {
    await this.assertEmployeeScope(userId, employeeId);

    const existing = await this.db
      .select({
        id: employeeBinding.id,
        status: employeeBinding.status,
      })
      .from(employeeBinding)
      .where(
        and(
          eq(employeeBinding.employeeId, employeeId),
          eq(employeeBinding.status, true),
        ),
      );

    if (existing.length === 0) {
      this.logger.log(`No active binding found for employee: ${employeeId}`);
      return { success: true };
    }

    for (const binding of existing) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(employeeBinding)
          .set({ status: false })
          .where(eq(employeeBinding.id, String(binding.id)));
        await tx.insert(auditLog).values({
          operatorId: userId,
          action: 'unbind',
          targetType: 'employee_binding',
          targetId: String(binding.id),
          changes: {
            before: { status: binding.status },
            after: { status: false },
          },
          reason: '员工解绑',
        });
      });
    }

    if (deleteSnapshot) {
      await this.employeeSnapshotService.deleteSnapshot(employeeId);
      this.logger.log(`Deleted snapshot for employee: ${employeeId}`);
    }

    this.logger.log(`Deactivated bindings for employee: ${employeeId}`);
    return { success: true };
  }

  /**
   * 按绑定记录 ID 解绑（TeamStructure 场景：通过 bindingId 定位）。
   */
  async unbindById(
    bindingId: string,
    userId: string,
  ): Promise<{ success: boolean; message?: string }> {
    const [existing] = await this.db
      .select({
        id: employeeBinding.id,
        employeeId: employeeBinding.employeeId,
        status: employeeBinding.status,
      })
      .from(employeeBinding)
      .where(eq(employeeBinding.id, bindingId));

    if (!existing) {
      this.logger.log(`Binding not found: ${bindingId}`);
      return { success: false, message: '绑定记录不存在' };
    }
    await this.assertEmployeeScope(userId, String(existing.employeeId));

    await this.db.transaction(async (tx) => {
      await tx
        .update(employeeBinding)
        .set({ status: false })
        .where(eq(employeeBinding.id, bindingId));
      await tx.insert(auditLog).values({
        operatorId: userId,
        action: 'unbind',
        targetType: 'employee_binding',
        targetId: bindingId,
        changes: {
          before: { status: existing.status },
          after: { status: false },
        },
        reason: '员工解绑',
      });
    });

    this.logger.log(`Deactivated binding: ${bindingId}`);
    return { success: true };
  }

  /**
   * 获取员工的绑定历史（含操作者姓名）。
   */
  async history(employeeId: string): Promise<EmployeeBindingHistoryResponse> {
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
        sql`(${employeeBinding.createdBy}).user_id = (${employee.employeeId}).user_id`,
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

  /**
   * 校验期间格式 YYYY-MM。
   */
  private isValidPeriod(period: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  }

  private async assertEmployeeScopes(
    userId: string,
    employeeIds: string[],
  ): Promise<void> {
    for (const employeeId of new Set(employeeIds)) {
      await this.assertEmployeeScope(userId, employeeId);
    }
  }

  private async assertEmployeeScope(
    userId: string,
    employeeId: string,
  ): Promise<void> {
    const canAccess = await this.accessScopeService.canAccessEmployee(
      userId,
      employeeId,
      { includeSelf: false },
    );
    if (!canAccess) {
      throw new ForbiddenException('无权操作该员工');
    }
  }
}
