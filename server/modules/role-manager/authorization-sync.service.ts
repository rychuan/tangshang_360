import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
  type PostgresJsDatabase,
} from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { authorizationSyncJob, employee } from '@server/database/schema';
import {
  effectiveAuthorizationRoles,
  normalizeAuthorizationRoles,
} from './authorization-state';
import { RoleManagerService } from './role-manager.service';

export const AUTHORIZATION_JOB_LEASE_MS = 5 * 60 * 1000;

export type AuthorizationSyncStatus =
  | 'synced'
  | 'failed'
  | 'superseded'
  | 'not_processable'
  | 'stale_owner';

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

type AuthorizationJobRow = {
  id: string;
  startedAt: Date | null;
  claimToken: string | null;
};

class StaleAuthorizationOwnerError extends Error {
  constructor() {
    super('Authorization job owner is stale');
  }
}

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

    const claim = await this.claimJob(job.id);
    if (!claim) {
      return {
        status: 'stale_owner',
        version: targetVersion,
        error: `Authorization sync job ${job.id} is owned by another live worker`,
      };
    }

    if (targetVersion !== currentVersion) {
      return this.finalizeJobOnly(
        job.id,
        claim.claimToken,
        targetVersion,
        'superseded',
      );
    }

    try {
      await this.roleManagerService.reconcileUserRoles(
        employeeId,
        effectiveAuthorizationRoles(employeeRow),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to reconcile authorization for ${employeeId} v${targetVersion}: ${message}`,
      );
      return this.finalizeEmployeeAuthorization(
        employeeId,
        targetVersion,
        job.id,
        claim.claimToken,
        'failed',
        message,
      );
    }

    return this.finalizeEmployeeAuthorization(
      employeeId,
      targetVersion,
      job.id,
      claim.claimToken,
      'synced',
    );
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

  private async loadJob(
    employeeId: string,
    version: number,
  ): Promise<AuthorizationJobRow | undefined> {
    const rows = await this.db
      .select({
        id: authorizationSyncJob.id,
        startedAt: authorizationSyncJob.startedAt,
        claimToken: authorizationSyncJob.claimToken,
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

  private async claimJob(
    jobId: string,
  ): Promise<{ id: string; claimToken: string } | undefined> {
    const claimToken = randomUUID();
    const leaseCutoff = new Date(Date.now() - AUTHORIZATION_JOB_LEASE_MS);
    const rows = await this.db
      .update(authorizationSyncJob)
      .set({
        status: 'processing',
        attemptCount: sql`${authorizationSyncJob.attemptCount} + 1`,
        startedAt: new Date(),
        claimToken,
        completedAt: null,
        errorMessage: null,
      })
      .where(
        and(
          eq(authorizationSyncJob.id, jobId),
          or(
            inArray(authorizationSyncJob.status, ['pending', 'failed']),
            and(
              eq(authorizationSyncJob.status, 'processing'),
              lt(authorizationSyncJob.startedAt, leaseCutoff),
            ),
          ),
        ),
      )
      .returning({
        id: authorizationSyncJob.id,
        claimToken: authorizationSyncJob.claimToken,
      });

    const row = rows[0];
    return row?.claimToken
      ? { id: row.id, claimToken: row.claimToken }
      : undefined;
  }

  private async finalizeEmployeeAuthorization(
    employeeId: string,
    version: number,
    jobId: string,
    claimToken: string,
    status: 'synced' | 'failed',
    errorMessage: string | null = null,
  ): Promise<AuthorizationSyncResult> {
    try {
      const finalized = await this.db.transaction(async (tx) => {
        const terminal = await this.transitionJobStatus(
          tx,
          jobId,
          claimToken,
          status,
          errorMessage,
        );
        if (!terminal) return false;

        const updated = await this.updateEmployeeStatus(
          tx,
          employeeId,
          version,
          status,
          errorMessage,
        );
        if (!updated) {
          throw new StaleAuthorizationOwnerError();
        }
        return true;
      });

      if (!finalized) {
        return this.staleOwnerResult(version, jobId);
      }
    } catch (error) {
      if (error instanceof StaleAuthorizationOwnerError) {
        return this.staleOwnerResult(version, jobId);
      }
      throw error;
    }

    return {
      status,
      version,
      ...(errorMessage ? { error: errorMessage } : {}),
    };
  }

  private async finalizeJobOnly(
    jobId: string,
    claimToken: string,
    version: number,
    status: 'superseded',
  ): Promise<AuthorizationSyncResult> {
    const finalized = await this.db.transaction(async (tx) =>
      this.transitionJobStatus(tx, jobId, claimToken, status, null),
    );
    return finalized
      ? { status, version }
      : this.staleOwnerResult(version, jobId);
  }

  private async updateEmployeeStatus(
    tx: PostgresJsDatabase,
    employeeId: string,
    version: number,
    status: 'synced' | 'failed',
    errorMessage: string | null,
  ): Promise<boolean> {
    const rows = await tx
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
    tx: PostgresJsDatabase,
    jobId: string,
    claimToken: string,
    status: 'synced' | 'failed' | 'superseded',
    errorMessage: string | null,
  ): Promise<boolean> {
    const rows = await tx
      .update(authorizationSyncJob)
      .set({
        status: status === 'synced' ? 'succeeded' : status,
        errorMessage,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(authorizationSyncJob.id, jobId),
          eq(authorizationSyncJob.status, 'processing'),
          eq(authorizationSyncJob.claimToken, claimToken),
        ),
      )
      .returning({ id: authorizationSyncJob.id });

    return rows.length > 0;
  }

  private staleOwnerResult(
    version: number,
    jobId: string,
  ): AuthorizationSyncResult {
    return {
      status: 'stale_owner',
      version,
      error: `Authorization sync job ${jobId} is no longer owned by this worker`,
    };
  }
}
