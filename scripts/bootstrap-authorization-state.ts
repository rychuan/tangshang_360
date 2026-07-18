/**
 * Bootstrap Authorization State
 *
 * Reads every active employee's durable authorizationRoles from the
 * database and reconciles them with the AuthorizationSDK, writing the
 * complete built-in + custom role assignments.
 *
 * Usage: npx ts-node scripts/bootstrap-authorization-state.ts
 */

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import { AppModule } from '../server/app.module';
import { AuthorizationSyncService } from '../server/modules/role-manager/authorization-sync.service';
import { RoleManagerService } from '../server/modules/role-manager/role-manager.service';
import { employee } from '../server/database/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { normalizeAuthorizationRoles } from '../server/modules/role-manager/authorization-state';

interface BootstrapResult {
  total: number;
  synced: number;
  failed: number;
  failures: Array<{ employeeId: string; version: number; error: string }>;
}

async function bootstrapAuthorizationState(): Promise<BootstrapResult> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    abortOnError: false,
  });
  const logger = new Logger('BootstrapAuthorization');

  try {
    const db = app.get(DRIZZLE_DATABASE);
    const syncService = app.get(AuthorizationSyncService);
    const roleManagerService = app.get(RoleManagerService);

    const rows = await db
      .select({
        employeeId: employee.employeeId,
        authorizationRoles: employee.authorizationRoles,
        authorizationStatus: employee.authorizationStatus,
        authorizationVersion: employee.authorizationVersion,
      })
      .from(employee)
      .where(and(eq(employee.status, true), isNull(employee.deletedAt)));

    const result: BootstrapResult = {
      total: rows.length,
      synced: 0,
      failed: 0,
      failures: [],
    };

    logger.log(`Bootstrapping ${rows.length} active employees`);

    for (const row of rows) {
      const rawRoles = Array.isArray(row.authorizationRoles)
        ? row.authorizationRoles
        : [];
      const desiredRoles = normalizeAuthorizationRoles(rawRoles);
      const employeeId = String(row.employeeId);

      try {
        // Strict read: get complete SDK role list for this employee
        const sdkRoles = await roleManagerService.getUserRoles(employeeId);
        // Write back the full set
        await syncService.reconcileUserRoles(employeeId, desiredRoles);

        // Verify by re-reading SDK
        const verified = await roleManagerService.getUserRoles(employeeId);
        const sortedVerified = [...verified].sort();
        const sortedDesired = [...desiredRoles].sort();

        if (
          sortedVerified.length !== sortedDesired.length ||
          sortedVerified.some((role, i) => role !== sortedDesired[i])
        ) {
          throw new Error(
            `SDK role mismatch: expected [${sortedDesired}], got [${sortedVerified}]`,
          );
        }

        result.synced++;
      } catch (error) {
        result.failed++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.failures.push({
          employeeId,
          version: row.authorizationVersion,
          error: errorMessage,
        });
        logger.error(
          `Failed to bootstrap ${employeeId} v${row.authorizationVersion}: ${errorMessage}`,
        );
        // Do not mark synced — remain fail closed
      }
    }

    logger.log(
      `Bootstrap complete: ${result.synced}/${result.total} synced, ${result.failed} failed`,
    );

    return result;
  } finally {
    await app.close();
  }
}

bootstrapAuthorizationState()
  .then((result) => {
    if (result.failed > 0) {
      console.error(JSON.stringify(result.failures, null, 2));
      process.exit(1);
    }
    console.log(`All ${result.synced} employees bootstrapped successfully`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Bootstrap crashed:', error);
    process.exit(2);
  });
