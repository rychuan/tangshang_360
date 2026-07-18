import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, sql } from 'drizzle-orm';
import { authorizationSyncJob, employee } from '@server/database/schema';
import { normalizeAuthorizationRoles } from './authorization-state';
import { RoleManagerService } from './role-manager.service';

export type AuthorizationSyncStatus = 'synced' | 'failed' | 'superseded';

export interface AuthorizationSyncResult {
  status: AuthorizationSyncStatus;
  version: number;
  error?: string;
}

type EmployeeAuthorizationRow = {
  authorizationRoles: string[];
  authorizationVersion: number;
};

@Injectable()
export class AuthorizationSyncService {
  private readonly logger = new Logger(AuthorizationSyncService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly roleManagerService: RoleManagerService,
  ) {}

  async stageAuthorizationChange(
    tx: PostgresJsDatabase,
    employeeId: string,
    desiredRoles: string[],
  ): Promise<number> {
    const rows = await tx
      .select({ authorizationVersion: employee.authorizationVersion })
      .from(employee)
      .where(eq(employee.employeeId, employeeId))
      .limit(1);
    const current = rows[0];

    if (!current) {
      throw new Error(`Employee ${employeeId} does not exist`);
    }

    const version = current.authorizationVersion + 1;
    const authorizationRoles = normalizeAuthorizationRoles(desiredRoles);
    const now = new Date();

    await tx
      .update(employee)
      .set({
        authorizationRoles,
        authorizationStatus: 'pending',
        authorizationVersion: version,
        authorizationError: null,
        authorizationUpdatedAt: now,
      })
      .where(eq(employee.employeeId, employeeId));

    await tx.insert(authorizationSyncJob).values({
      employeeId,
      authorizationVersion: version,
      status: 'pending',
      attemptCount: 0,
      errorMessage: null,
    });

    return version;
  }

  async processEmployeeAuthorization(
    employeeId: string,
    version?: number,
  ): Promise<AuthorizationSyncResult> {
    const employeeRow = await this.loadEmployee(employeeId);
    if (!employeeRow) {
      return {
        status: 'failed',
        version: version ?? 0,
        error: `Employee ${employeeId} does not exist`,
      };
    }

    const currentVersion = employeeRow.authorizationVersion;
    const targetVersion = version ?? currentVersion;

    if (targetVersion !== currentVersion) {
      await this.updateJobStatus(employeeId, targetVersion, 'superseded');
      return { status: 'superseded', version: targetVersion };
    }

    const job = await this.loadJob(employeeId, targetVersion);
    if (job) {
      await this.db
        .update(authorizationSyncJob)
        .set({
          status: 'processing',
          attemptCount: sql`${authorizationSyncJob.attemptCount} + 1`,
          startedAt: new Date(),
          completedAt: null,
          errorMessage: null,
        })
        .where(eq(authorizationSyncJob.id, job.id));
    }

    try {
      await this.roleManagerService.reconcileUserRoles(
        employeeId,
        employeeRow.authorizationRoles,
      );

      const updated = await this.updateEmployeeStatus(
        employeeId,
        targetVersion,
        'synced',
        null,
      );
      if (!updated) {
        await this.updateJobStatus(employeeId, targetVersion, 'superseded');
        return { status: 'superseded', version: targetVersion };
      }

      await this.updateJobStatus(employeeId, targetVersion, 'succeeded');
      return { status: 'synced', version: targetVersion };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to reconcile authorization for ${employeeId} v${targetVersion}: ${message}`,
      );

      const updated = await this.updateEmployeeStatus(
        employeeId,
        targetVersion,
        'failed',
        message,
      );
      if (!updated) {
        await this.updateJobStatus(employeeId, targetVersion, 'superseded');
        return { status: 'superseded', version: targetVersion };
      }

      await this.updateJobStatus(employeeId, targetVersion, 'failed', message);
      return {
        status: 'failed',
        version: targetVersion,
        error: message,
      };
    }
  }

  async retryEmployeeAuthorization(
    employeeId: string,
  ): Promise<AuthorizationSyncResult> {
    return this.processEmployeeAuthorization(employeeId);
  }

  private async loadEmployee(
    employeeId: string,
  ): Promise<EmployeeAuthorizationRow | undefined> {
    const rows = await this.db
      .select({
        authorizationRoles: employee.authorizationRoles,
        authorizationVersion: employee.authorizationVersion,
      })
      .from(employee)
      .where(eq(employee.employeeId, employeeId))
      .limit(1);
    return rows[0];
  }

  private async loadJob(employeeId: string, version: number) {
    const rows = await this.db
      .select({
        id: authorizationSyncJob.id,
        attemptCount: authorizationSyncJob.attemptCount,
      })
      .from(authorizationSyncJob)
      .where(
        and(
          eq(authorizationSyncJob.employeeId, employeeId),
          eq(authorizationSyncJob.authorizationVersion, version),
        ),
      )
      .orderBy(desc(authorizationSyncJob.createdAt))
      .limit(1);
    return rows[0];
  }

  private async updateEmployeeStatus(
    employeeId: string,
    version: number,
    status: 'synced' | 'failed',
    errorMessage: string | null = null,
  ): Promise<boolean> {
    const rows = await this.db
      .update(employee)
      .set({
        authorizationStatus: status,
        authorizationVersion: version,
        authorizationError: errorMessage,
        authorizationUpdatedAt: new Date(),
      })
      .where(
        and(
          eq(employee.employeeId, employeeId),
          eq(employee.authorizationVersion, version),
        ),
      )
      .returning({ authorizationVersion: employee.authorizationVersion });

    return rows.length > 0;
  }

  private async updateJobStatus(
    employeeId: string,
    version: number,
    status: 'succeeded' | 'failed' | 'superseded',
    errorMessage: string | null = null,
  ): Promise<void> {
    await this.db
      .update(authorizationSyncJob)
      .set({
        status,
        errorMessage,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(authorizationSyncJob.employeeId, employeeId),
          eq(authorizationSyncJob.authorizationVersion, version),
        ),
      );
  }
}
