import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  employee,
  employeeBinding,
  assessmentTemplate,
  auditLog,
} from '@server/database/schema';
import { EmployeeSnapshotService } from '../employee-snapshot/employee-snapshot.service';
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
      .select({ id: employee.id })
      .from(employee)
      .where(and(eq(employee.id, employeeId), isNull(employee.deletedAt)))
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
          eq(employeeBinding.status, 'active'),
        ),
      );

    const oldTemplateId: string | null =
      existing.length > 0 ? existing[0].templateId : null;

    return this.db
      .transaction(async (tx: any) => {
        if (existing.length > 0) {
          await tx
            .update(employeeBinding)
            .set({ status: 'inactive' })
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
            status: 'active',
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
    const results: string[] = [];
    for (const eId of employeeIds) {
      const { bindingId } = await this.bind(
        eId,
        templateId,
        effectiveFrom,
        userId,
      );
      results.push(bindingId);
    }
    this.logger.log(
      `Created ${results.length} bindings for employees: ${employeeIds.join(', ')}`,
    );
    return { ids: results };
  }

  /**
   * 按员工 ID 解绑所有活跃绑定。
   */
  async unbind(
    employeeId: string,
    userId: string,
    deleteSnapshot: boolean = false,
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
      .select({ id: employeeBinding.id, status: employeeBinding.status })
      .from(employeeBinding)
      .where(eq(employeeBinding.id, bindingId));

    if (!existing) {
      this.logger.log(`Binding not found: ${bindingId}`);
      return { success: false, message: '绑定记录不存在' };
    }

    await this.db
      .update(employeeBinding)
      .set({ status: 'inactive' })
      .where(eq(employeeBinding.id, bindingId));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'unbind',
      targetType: 'employee_binding',
      targetId: bindingId,
      changes: {
        before: { status: existing.status },
        after: { status: 'inactive' },
      },
      reason: '员工解绑',
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

  /**
   * 校验期间格式 YYYY-MM。
   */
  private isValidPeriod(period: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
  }
}
