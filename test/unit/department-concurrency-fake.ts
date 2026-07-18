import { PgDialect } from 'drizzle-orm/pg-core';
import { auditLog, department, employee } from '../../server/database/schema';

type DepartmentRow = {
  id: string;
  name: string;
  parentId: string | null;
  headId: string | null;
  sortOrder: number;
};

type EmployeeRow = {
  employeeId: string;
  authorizationRoles: string[];
  authorizationStatus: 'pending' | 'synced' | 'failed';
  authorizationVersion: number;
};

type TransactionState = {
  departmentChanges: Map<string, DepartmentRow>;
  deletedDepartmentIds: Set<string>;
  employeeChanges: Map<string, EmployeeRow>;
  releases: Array<() => void>;
};

type Selection = Record<string, unknown>;

const dialect = new PgDialect();

function queryParams(condition: unknown): unknown[] {
  if (!condition) return [];
  return dialect.sqlToQuery(condition as any).params;
}

function querySql(condition: unknown): string {
  if (!condition) return '';
  return dialect.sqlToQuery(condition as any).sql;
}

export class DepartmentConcurrencyDb {
  readonly lockLog: string[] = [];
  readonly stageLog: Array<{
    employeeId: string;
    roles: string[];
    version: number;
  }> = [];

  private readonly departments = new Map<string, DepartmentRow>();
  private readonly employees = new Map<string, EmployeeRow>();
  private readonly lockTails = new Map<string, Promise<void>>();
  private outsideReadTarget = 0;
  private outsideReadCount = 0;
  private outsideReadRelease: (() => void) | null = null;
  private outsideReadBarrier: Promise<void> | null = null;
  private pausedLockKey: string | null = null;
  private pausedLockAcquired: (() => void) | null = null;
  private pausedLockBarrier: Promise<void> | null = null;
  private pausedLockRelease: (() => void) | null = null;

  constructor(options: {
    departments: DepartmentRow[];
    employees: EmployeeRow[];
  }) {
    for (const row of options.departments) {
      this.departments.set(row.id, { ...row });
    }
    for (const row of options.employees) {
      this.employees.set(row.employeeId, {
        ...row,
        authorizationRoles: [...row.authorizationRoles],
      });
    }
  }

  coordinateLegacyOutsideHeadReads(count: number): void {
    this.outsideReadTarget = count;
    this.outsideReadCount = 0;
    this.outsideReadBarrier = new Promise<void>((resolve) => {
      this.outsideReadRelease = resolve;
    });
  }

  pauseNextLock(key: string): {
    acquired: Promise<void>;
    release: () => void;
  } {
    this.pausedLockKey = key;
    const acquired = new Promise<void>((resolve) => {
      this.pausedLockAcquired = resolve;
    });
    this.pausedLockBarrier = new Promise<void>((resolve) => {
      this.pausedLockRelease = resolve;
    });
    return {
      acquired,
      release: () => this.pausedLockRelease?.(),
    };
  }

  getDepartment(id: string): DepartmentRow | undefined {
    const row = this.departments.get(id);
    return row ? { ...row } : undefined;
  }

  getRoles(employeeId: string): string[] {
    return [...(this.employees.get(employeeId)?.authorizationRoles ?? [])];
  }

  select = jest.fn((selection: Selection) =>
    this.createSelectQuery(selection, null),
  );

  transaction = jest.fn(
    async <T>(
      callback: (tx: ReturnType<DepartmentConcurrencyDb['createTx']>) => Promise<T>,
    ): Promise<T> => {
      const state: TransactionState = {
        departmentChanges: new Map(),
        deletedDepartmentIds: new Set(),
        employeeChanges: new Map(),
        releases: [],
      };
      const tx = this.createTx(state);
      try {
        const result = await callback(tx);
        this.commit(state);
        return result;
      } finally {
        for (const release of state.releases.reverse()) {
          release();
        }
      }
    },
  );

  createAuthorizationSyncService() {
    return {
      stageAuthorizationChange: jest.fn(
        async (
          tx: ReturnType<DepartmentConcurrencyDb['createTx']>,
          employeeId: string,
          roles: string[],
        ) => {
          const current = tx.__readEmployee(employeeId);
          if (!current) throw new Error(`missing employee ${employeeId}`);
          const version = current.authorizationVersion + 1;
          tx.__writeEmployee({
            ...current,
            authorizationRoles: [...roles],
            authorizationStatus: 'pending',
            authorizationVersion: version,
          });
          this.stageLog.push({ employeeId, roles: [...roles], version });
          return version;
        },
      ),
      processEmployeeAuthorization: jest.fn(
        async (employeeId: string, version: number) => ({
          status: 'synced',
          employeeId,
          version,
        }),
      ),
    };
  }

  private createTx(state: TransactionState) {
    return {
      select: jest.fn((selection: Selection) =>
        this.createSelectQuery(selection, state),
      ),
      update: jest.fn((table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
          where: async (condition: unknown) => {
            if (table === department) {
              const id = String(queryParams(condition)[0]);
              const current = this.readDepartment(id, state);
              if (current) {
                state.departmentChanges.set(id, {
                  ...current,
                  ...values,
                } as DepartmentRow);
              }
            }
          },
        }),
      })),
      delete: jest.fn((table: unknown) => ({
        where: async (condition: unknown) => {
          if (table === department) {
            const id = String(queryParams(condition)[0]);
            state.deletedDepartmentIds.add(id);
            state.departmentChanges.delete(id);
          }
        },
      })),
      insert: jest.fn((table: unknown) => ({
        values: async () => {
          if (table !== auditLog) {
            throw new Error('unexpected insert');
          }
        },
      })),
      __readEmployee: (employeeId: string) =>
        this.readEmployee(employeeId, state),
      __writeEmployee: (row: EmployeeRow) => {
        state.employeeChanges.set(row.employeeId, {
          ...row,
          authorizationRoles: [...row.authorizationRoles],
        });
      },
    };
  }

  private createSelectQuery(
    selection: Selection,
    state: TransactionState | null,
  ) {
    let table: unknown;
    let condition: unknown;
    let limitValue: number | null = null;

    const execute = async (lockRows: boolean) => {
      if (lockRows && state) {
        await this.lockSelectedRows(table, condition, state);
      }
      const rows = this.selectRows(table, selection, condition, state);
      const limited = limitValue == null ? rows : rows.slice(0, limitValue);
      if (
        !state &&
        this.outsideReadTarget > 0 &&
        'oldHeadId' in selection
      ) {
        this.outsideReadCount += 1;
        if (this.outsideReadCount >= this.outsideReadTarget) {
          this.outsideReadRelease?.();
        }
        await this.outsideReadBarrier;
      }
      return limited;
    };

    const query = {
      from: (nextTable: unknown) => {
        table = nextTable;
        return query;
      },
      where: (nextCondition: unknown) => {
        condition = nextCondition;
        return query;
      },
      orderBy: () => query,
      limit: (nextLimit: number) => {
        limitValue = nextLimit;
        return execute(false);
      },
      for: async (strength: string) => {
        if (strength !== 'update') {
          throw new Error(`unexpected lock strength ${strength}`);
        }
        return execute(true);
      },
      then: (
        resolve: (rows: Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => execute(false).then(resolve, reject),
    };
    return query;
  }

  private async lockSelectedRows(
    table: unknown,
    condition: unknown,
    state: TransactionState,
  ): Promise<void> {
    const params = queryParams(condition).map(String);
    if (table === department) {
      const id = params[0];
      await this.acquireLock(`department:${id}`, state);
      return;
    }
    if (table === employee) {
      for (const employeeId of [...params].sort((a, b) =>
        a.localeCompare(b),
      )) {
        await this.acquireLock(`employee:${employeeId}`, state);
      }
    }
  }

  private async acquireLock(
    key: string,
    state: TransactionState,
  ): Promise<void> {
    const previous = this.lockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.lockTails.set(
      key,
      previous.then(() => held),
    );
    await previous;
    this.lockLog.push(key);
    state.releases.push(release);
    if (this.pausedLockKey === key) {
      this.pausedLockKey = null;
      this.pausedLockAcquired?.();
      await this.pausedLockBarrier;
    }
  }

  private selectRows(
    table: unknown,
    selection: Selection,
    condition: unknown,
    state: TransactionState | null,
  ): Record<string, unknown>[] {
    if (table === department) {
      const rows = this.readDepartments(state);
      const sqlText = querySql(condition);
      const params = queryParams(condition).map(String);
      let filtered = rows;
      if (sqlText.includes('"department"."id" =')) {
        filtered = rows.filter((row) => row.id === params[0]);
      } else if (sqlText.includes('"department"."parent_id" =')) {
        filtered = rows.filter((row) => row.parentId === params[0]);
      } else if (sqlText.includes('"department"."head_id"')) {
        const headId = params[0];
        filtered = rows.filter((row) => row.headId === headId);
        if (sqlText.includes('<>') && params[1]) {
          filtered = filtered.filter((row) => row.id !== params[1]);
        }
      }
      if ('cnt' in selection) {
        return [{ cnt: filtered.length }];
      }
      return filtered.map((row) => ({
        id: row.id,
        name: row.name,
        oldName: row.name,
        parentId: row.parentId,
        headId: row.headId,
        oldHeadId: row.headId,
        sortOrder: row.sortOrder,
      }));
    }

    if (table === employee) {
      const employeeIds = queryParams(condition).map(String);
      return employeeIds
        .map((employeeId) =>
          state
            ? this.readEmployee(employeeId, state)
            : this.employees.get(employeeId),
        )
        .filter((row): row is EmployeeRow => Boolean(row))
        .map((row) => ({
          employeeId: row.employeeId,
          authorizationRoles: [...row.authorizationRoles],
          authorizationStatus: row.authorizationStatus,
          authorizationVersion: row.authorizationVersion,
        }));
    }

    return [];
  }

  private readDepartments(state: TransactionState | null): DepartmentRow[] {
    const rows = new Map(
      Array.from(this.departments.entries()).map(([id, row]) => [
        id,
        { ...row },
      ]),
    );
    if (state) {
      for (const id of state.deletedDepartmentIds) rows.delete(id);
      for (const [id, row] of state.departmentChanges) {
        rows.set(id, { ...row });
      }
    }
    return Array.from(rows.values());
  }

  private readDepartment(
    id: string,
    state: TransactionState,
  ): DepartmentRow | undefined {
    if (state.deletedDepartmentIds.has(id)) return undefined;
    const row = state.departmentChanges.get(id) ?? this.departments.get(id);
    return row ? { ...row } : undefined;
  }

  private readEmployee(
    employeeId: string,
    state: TransactionState,
  ): EmployeeRow | undefined {
    const row =
      state.employeeChanges.get(employeeId) ?? this.employees.get(employeeId);
    return row
      ? { ...row, authorizationRoles: [...row.authorizationRoles] }
      : undefined;
  }

  private commit(state: TransactionState): void {
    for (const id of state.deletedDepartmentIds) {
      this.departments.delete(id);
    }
    for (const [id, row] of state.departmentChanges) {
      this.departments.set(id, { ...row });
    }
    for (const [employeeId, row] of state.employeeChanges) {
      this.employees.set(employeeId, {
        ...row,
        authorizationRoles: [...row.authorizationRoles],
      });
    }
  }
}
