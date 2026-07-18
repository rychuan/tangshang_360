import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { authorizationSyncJob, employee } from '@server/database/schema';
import {
  effectiveAuthorizationRoles,
  normalizeAuthorizationRoles,
} from './authorization-state';
import { RoleManagerService } from './role-manager.service';

export type AuthorizationSyncStatus =
  | 'synced'
  | 'failed'
  | 'superseded'
  | 'not_processable';

export interface AuthorizationSyncResult {
  status: AuthorizationSyncStatus;
  version: number;
  error?: string;
}

type EmployeeAuthorizationRow = {
  authorizationRoles: string[];
  authorizationVersion: number;
  status: boolean;
  deletedAt: Date | string | null;
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
      .update(employee)
      .set({
        authorizationRoles: normalizeAuthorizationRoles(desiredRoles),
        authorizationStatus: 'pending',
        authorizationVersion: sql`${employee.authorizationVersion} + 1`,
        authorizationError: null,
        authorizationUpdatedAt: new Date(),
      })
      .where(eq(employee.employeeId, employeeId))
      .returning({ authorizationVersion: employee.authorizationVersion });
    const version = rows[0]?.authorizationVersion;

    if (version == null) {
      throw new Error(`Employee ${employeeId} does not exist`);
    }

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
    const job = await this.loadJob(employeeId, targetVersion);

    if (!job) {
      return {
        status: 'not_processable',
        version: targetVersion,
        error: `No authorization sync job exists for ${employeeId} v${targetVersion}`,
      };
    }

    if (targetVersion !== currentVersion) {
      await this.supersedeJob(employeeId, targetVersion);
      return { status: 'superseded', version: targetVersion };
    }

    const claimed = await this.claimJob(job.id);
    if (!claimed) {
      return {
        status: 'not_processable',
        version: targetVersion,
        error: `Authorization sync job ${job.id} is not pending or failed`,
      };
    }

    try {
      await this.roleManagerService.reconcileUserRoles(
        employeeId,
        effectiveAuthorizationRoles(employeeRow),
      );

      const updated = await this.updateEmployeeStatus(
        employeeId,
        targetVersion,
        'synced',
        null,
      );
      if (!updated) {
        await this.transitionJobStatus(job.id, 'processing', 'superseded');
        return { status: 'superseded', version: targetVersion };
      }

      await this.transitionJobStatus(job.id, 'processing', 'succeeded');
      return { status: 'synced', version: targetVersion };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to reconcile authorization for ${employeeId} v${targetVersion}: ${message}`,
      );

      const failed = await this.transitionJobStatus(
        job.id,
        'processing',
        'failed',
        message,
      );
      if (!failed) {
        return {
          status: 'not_processable',
          version: targetVersion,
          error: `Authorization sync job ${job.id} is no longer processing`,
        };
      }

      const updated = await this.updateEmployeeStatus(
        employeeId,
        targetVersion,
        'failed',
        message,
      );
      if (!updated) {
        await this.transitionJobStatus(job.id, 'failed', 'superseded');
        return { status: 'superseded', version: targetVersion };
      }

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
        status: employee.status,
        deletedAt: employee.deletedAt,
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

  private async claimJob(jobId: string): Promise<boolean> {
    const rows = await this.db
      .update(authorizationSyncJob)
      .set({
        status: 'processing',
        attemptCount: sql`${authorizationSyncJob.attemptCount} + 1`,
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
      })
      .where(
        and(
          eq(authorizationSyncJob.id, jobId),
          inArray(authorizationSyncJob.status, ['pending', 'failed']),
        ),
      )
      .returning({ id: authorizationSyncJob.id });

    return rows.length > 0;
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

  private async transitionJobStatus(
    jobId: string,
    fromStatus: 'processing' | 'failed',
    status: 'succeeded' | 'failed' | 'superseded',
    errorMessage: string | null = null,
  ): Promise<boolean> {
    const rows = await this.db
      .update(authorizationSyncJob)
      .set({
        status,
        errorMessage,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(authorizationSyncJob.id, jobId),
          eq(authorizationSyncJob.status, fromStatus),
        ),
      )
      .returning({ id: authorizationSyncJob.id });

    return rows.length > 0;
  }

  private async supersedeJob(
    employeeId: string,
    version: number,
  ): Promise<boolean> {
    const rows = await this.db
      .update(authorizationSyncJob)
      .set({
        status: 'superseded',
        errorMessage: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(authorizationSyncJob.employeeId, employeeId),
          eq(authorizationSyncJob.authorizationVersion, version),
          inArray(authorizationSyncJob.status, ['pending', 'failed']),
        ),
      )
      .returning({ id: authorizationSyncJob.id });

    return rows.length > 0;
  }
}
