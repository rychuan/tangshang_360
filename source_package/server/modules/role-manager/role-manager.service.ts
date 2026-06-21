import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
  AuthorizationSDK,
} from '@lark-apaas/fullstack-nestjs-core';
import { eq } from 'drizzle-orm';
import { rolePermissionConfig } from '@server/database/schema';
import type {
  RolePermissionConfig,
  PermissionItem,
} from '@shared/api.interface';

@Injectable()
export class RoleManagerService {
  private readonly logger = new Logger(RoleManagerService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authzSDK: AuthorizationSDK,
  ) {}

  async getUserRoles(userId: string): Promise<string[]> {
    const roles: string[] = [];
    try {
      const allRoles = await this.authzSDK.roles.list();
      const roleList = Array.isArray(allRoles) ? allRoles : (allRoles as any).items || [];
      for (const role of roleList) {
        const bizID = role.bizID;
        if (!bizID) continue;
        let isMember = false;
        try {
          const membersResult = await this.authzSDK.members.list(bizID, { pageSize: 999 });
          const members = (membersResult as any).members || membersResult || {};
          if (members.allEmployees) {
            isMember = true;
          }
          if (!isMember && members.presetGroup?.isContainsAdmin) {
            isMember = true;
          }
          if (!isMember && Array.isArray(members.userList)) {
            isMember = members.userList.some(
              (u: any) => u.userID === userId || u.user_id === userId,
            );
          }
        } catch (err) {
          this.logger.warn(`Failed to list members for role ${bizID}: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (isMember) {
          roles.push(bizID);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to get user roles: ${err instanceof Error ? err.message : String(err)}`);
    }
    return roles;
  }

  async getPermissionConfig(
    roleBizId: string,
  ): Promise<RolePermissionConfig | null> {
    const rows = await this.db
      .select({
        roleBizId: rolePermissionConfig.roleBizId,
        permissions: rolePermissionConfig.permissions,
      })
      .from(rolePermissionConfig)
      .where(eq(rolePermissionConfig.roleBizId, roleBizId))
      .limit(1);

    if (rows.length === 0) {
      return null;
    }

    return {
      roleBizId: rows[0].roleBizId,
      permissions: rows[0].permissions as PermissionItem[],
    };
  }

  async upsertPermissionConfig(
    roleBizId: string,
    permissions: PermissionItem[],
  ): Promise<void> {
    const existing = await this.db
      .select({ id: rolePermissionConfig.id })
      .from(rolePermissionConfig)
      .where(eq(rolePermissionConfig.roleBizId, roleBizId))
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(rolePermissionConfig)
        .set({ permissions })
        .where(eq(rolePermissionConfig.roleBizId, roleBizId));
    } else {
      await this.db
        .insert(rolePermissionConfig)
        .values({ roleBizId, permissions });
    }

    this.logger.log(`Permission config updated for role: ${roleBizId}`);
  }

  async deletePermissionConfig(roleBizId: string): Promise<void> {
    await this.db
      .delete(rolePermissionConfig)
      .where(eq(rolePermissionConfig.roleBizId, roleBizId));
  }

  async getAllPermissionConfigs(): Promise<RolePermissionConfig[]> {
    const rows = await this.db
      .select({
        roleBizId: rolePermissionConfig.roleBizId,
        permissions: rolePermissionConfig.permissions,
      })
      .from(rolePermissionConfig);

    return rows.map((row) => ({
      roleBizId: row.roleBizId,
      permissions: row.permissions as PermissionItem[],
    }));
  }
}
