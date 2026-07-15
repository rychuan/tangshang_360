import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, asc, count, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { systemDict, employee, auditLog } from '@server/database/schema';
import type {
  DictEntry,
  DictListResponse,
  CreateDictRequest,
  UpdateDictRequest,
} from '@shared/api.interface';

type UsageChecker = (value: string) => Promise<number>;

@Injectable()
export class SystemDictService {
  private readonly logger = new Logger(SystemDictService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  /**
   * 字典类型的引用检查映射。新增字典类型时在此注册即可。
   */
  private usageCheckers: Record<string, UsageChecker> = {
    position: async (name: string) => {
      const r = await this.db
        .select({ cnt: count() })
        .from(employee)
        .where(and(eq(employee.position, name), isNull(employee.deletedAt)));
      return Number(r[0].cnt);
    },
  };

  async list(dictType: string, keyword?: string, onlyActive?: boolean): Promise<DictListResponse> {
    const conditions: ReturnType<typeof eq>[] = [eq(systemDict.dictType, dictType)];
    if (keyword) {
      conditions.push(sql`${systemDict.name} ILIKE ${'%' + keyword + '%'}`);
    }
    if (onlyActive) {
      conditions.push(eq(systemDict.isActive, true));
    }

    const items = await this.db
      .select({
        id: systemDict.id,
        dictType: systemDict.dictType,
        code: systemDict.code,
        name: systemDict.name,
        sortOrder: systemDict.sortOrder,
        isActive: systemDict.isActive,
        createdAt: systemDict.createdAt,
      })
      .from(systemDict)
      .where(and(...conditions))
      .orderBy(asc(systemDict.sortOrder), asc(systemDict.name));

    return {
      items: items.map((r) => ({
        id: r.id,
        dictType: r.dictType,
        code: r.code,
        name: r.name,
        sortOrder: Number(r.sortOrder),
        isActive: Boolean(r.isActive),
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
      })),
    };
  }

  async create(
    dictType: string,
    body: CreateDictRequest,
    userId: string,
  ): Promise<{ id: string }> {
    if (!body.name?.trim()) throw new BadRequestException('名称不能为空');
    const code = body.code?.trim() || body.name.trim();

    const existing = await this.db
      .select({ id: systemDict.id })
      .from(systemDict)
      .where(and(eq(systemDict.dictType, dictType), eq(systemDict.code, code)))
      .limit(1);
    if (existing.length > 0) throw new BadRequestException('该编码已存在');

    const [inserted] = await this.db
      .insert(systemDict)
      .values({
        dictType,
        code,
        name: body.name.trim(),
        sortOrder: body.sortOrder ?? 0,
      })
      .returning({ id: systemDict.id });

    if (!inserted) throw new BadRequestException('创建失败');

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'create_dict',
      targetType: 'system_dict',
      targetId: inserted.id,
      changes: { after: { dictType, ...body } },
    });
    return { id: inserted.id };
  }

  async update(
    dictType: string,
    id: string,
    body: UpdateDictRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    if (!body.name?.trim()) throw new BadRequestException('名称不能为空');

    const rows = await this.db
      .select({ id: systemDict.id })
      .from(systemDict)
      .where(and(eq(systemDict.id, id), eq(systemDict.dictType, dictType)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException('字典条目不存在');

    const code = body.code?.trim() || body.name.trim();
    const dup = await this.db
      .select({ id: systemDict.id })
      .from(systemDict)
      .where(
        and(
          eq(systemDict.dictType, dictType),
          eq(systemDict.code, code),
          sql`${systemDict.id} != ${id}`,
        ),
      )
      .limit(1);
    if (dup.length > 0) throw new BadRequestException('该编码已存在');

    await this.db
      .update(systemDict)
      .set({ code, name: body.name.trim(), sortOrder: body.sortOrder ?? 0 })
      .where(eq(systemDict.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'update_dict',
      targetType: 'system_dict',
      targetId: id,
      changes: { after: { dictType, ...body } },
    });
    return { success: true };
  }

  async remove(
    dictType: string,
    id: string,
    userId: string,
  ): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: systemDict.id, name: systemDict.name })
      .from(systemDict)
      .where(and(eq(systemDict.id, id), eq(systemDict.dictType, dictType)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException('字典条目不存在');

    const checker = this.usageCheckers[dictType];
    if (checker) {
      const cnt = await checker(rows[0].name);
      if (cnt > 0) {
        throw new BadRequestException(
          `「${rows[0].name}」正在被 ${cnt} 条记录使用，无法删除`,
        );
      }
    }

    await this.db.delete(systemDict).where(eq(systemDict.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'delete_dict',
      targetType: 'system_dict',
      targetId: id,
      changes: { before: { dictType, name: rows[0].name } },
    });
    return { success: true };
  }
}
