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
import { position, employee, auditLog } from '@server/database/schema';
import type {
  PositionItem,
  PositionListResponse,
  CreatePositionRequest,
  UpdatePositionRequest,
} from '@shared/api.interface';

@Injectable()
export class PositionService {
  private readonly logger = new Logger(PositionService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async list(query?: { keyword?: string }): Promise<PositionListResponse> {
    const conditions = [];
    if (query?.keyword) {
      conditions.push(sql`${position.name} ILIKE ${'%' + query.keyword + '%'}`);
    }

    const items = await this.db
      .select({
        id: position.id,
        name: position.name,
        sortOrder: position.sortOrder,
        isActive: position.isActive,
        createdAt: position.createdAt,
      })
      .from(position)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(position.sortOrder), asc(position.name));

    return {
      items: items.map((r) => ({
        id: r.id,
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
    body: CreatePositionRequest,
    userId: string,
  ): Promise<{ id: string }> {
    if (!body.name?.trim()) {
      throw new BadRequestException('岗位名称不能为空');
    }

    const existing = await this.db
      .select({ id: position.id })
      .from(position)
      .where(eq(position.name, body.name.trim()))
      .limit(1);
    if (existing.length > 0) {
      throw new BadRequestException('岗位名称已存在');
    }

    const [inserted] = await this.db
      .insert(position)
      .values({
        name: body.name.trim(),
        sortOrder: body.sortOrder ?? 0,
      })
      .returning({ id: position.id });

    if (!inserted) {
      throw new BadRequestException('创建岗位失败');
    }

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'create_position',
      targetType: 'position',
      targetId: inserted.id,
      changes: { after: body },
    });

    return { id: inserted.id };
  }

  async update(
    id: string,
    body: UpdatePositionRequest,
    userId: string,
  ): Promise<{ success: boolean }> {
    if (!body.name?.trim()) {
      throw new BadRequestException('岗位名称不能为空');
    }

    const rows = await this.db
      .select({ id: position.id })
      .from(position)
      .where(eq(position.id, id))
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundException('岗位不存在');
    }

    const dup = await this.db
      .select({ id: position.id })
      .from(position)
      .where(
        sql`${position.name} = ${body.name.trim()} AND ${position.id} != ${id}`,
      )
      .limit(1);
    if (dup.length > 0) {
      throw new BadRequestException('岗位名称已存在');
    }

    await this.db
      .update(position)
      .set({ name: body.name.trim(), sortOrder: body.sortOrder ?? 0 })
      .where(eq(position.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'update_position',
      targetType: 'position',
      targetId: id,
      changes: { after: body },
    });

    return { success: true };
  }

  async remove(id: string, userId: string): Promise<{ success: boolean }> {
    const rows = await this.db
      .select({ id: position.id, name: position.name })
      .from(position)
      .where(eq(position.id, id))
      .limit(1);
    if (rows.length === 0) {
      throw new NotFoundException('岗位不存在');
    }

    const usedCount = await this.db
      .select({ cnt: count() })
      .from(employee)
      .where(
        and(eq(employee.position, rows[0].name), isNull(employee.deletedAt)),
      );
    if (Number(usedCount[0].cnt) > 0) {
      throw new BadRequestException(
        `岗位「${rows[0].name}」正在被 ${Number(usedCount[0].cnt)} 名员工使用，无法删除`,
      );
    }

    await this.db.delete(position).where(eq(position.id, id));

    await this.db.insert(auditLog).values({
      operatorId: userId,
      action: 'delete_position',
      targetType: 'position',
      targetId: id,
      changes: { before: { name: rows[0].name } },
    });

    return { success: true };
  }
}
