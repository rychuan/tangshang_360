import {
  department,
  employee,
  rolePermissionConfig,
} from '../../server/database/schema';

type Table = typeof employee | typeof department | typeof rolePermissionConfig;

type Selection = Record<string, unknown>;

export type FakeEmployeeRow = {
  employeeId: string;
  position?: string;
  status: boolean;
  deletedAt: Date | string | null;
  authorizationStatus: 'pending' | 'synced' | 'failed';
  authorizationRoles: string[];
  authorizationVersion: number;
  supervisorId: string | null;
  departmentId: string | null;
};

export type FakeDepartmentRow = {
  id: string;
  headId: string | null;
  isActive: boolean;
};

export type FakePermissionConfigRow = {
  roleBizId: string;
  permissions: Array<{ resource: string; actions: string[] }>;
};

function isColumn(value: unknown): value is { name: string; table: Table } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'name' in value &&
    'table' in value &&
    !('queryChunks' in value),
  );
}

function isParam(
  value: unknown,
): value is { value: unknown; encoder: unknown } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'value' in value &&
    'encoder' in value,
  );
}

function isSql(value: unknown): value is { queryChunks: unknown[] } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'queryChunks' in value &&
    Array.isArray((value as { queryChunks?: unknown[] }).queryChunks),
  );
}

function propertyName(columnName: string): string {
  return columnName.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function matches(
  table: Table,
  row: Record<string, unknown>,
  condition: unknown,
): boolean {
  const chunks = (condition as { queryChunks?: unknown[] } | undefined)
    ?.queryChunks;
  if (!Array.isArray(chunks)) return true;
  const conditionText = chunks
    .map(extractChunkText)
    .join('')
    .trim()
    .toLowerCase();
  if (conditionText === 'false') return false;

  const nested = chunks.filter(isSql);
  const logicalOperator = chunks
    .filter((chunk): chunk is { value: string[] } =>
      Boolean(
        chunk &&
        typeof chunk === 'object' &&
        'value' in chunk &&
        Array.isArray((chunk as { value?: unknown }).value),
      ),
    )
    .flatMap((chunk) => chunk.value)
    .find((value) => value.includes(' and ') || value.includes(' or '));

  if (logicalOperator && nested.length > 0) {
    if (logicalOperator.includes(' or ')) {
      return nested.some((child) => matches(table, row, child));
    }
    return nested.every((child) => matches(table, row, child));
  }

  if (nested.length === 1) {
    return matches(table, row, nested[0]);
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (!isColumn(chunk)) continue;

    const operatorText = extractChunkText(chunks[index + 1]);
    const right = chunks[index + 2];
    const actual = row[propertyName(chunk.name)];
    const rightValue = extractRightValue(right);

    if (operatorText.includes('user_id =')) {
      return chunk.table !== table || actual === rightValue;
    }
    if (operatorText.includes('user_id !=')) {
      return chunk.table !== table || actual !== rightValue;
    }
    if (operatorText === ' = ') {
      return chunk.table !== table || actual === rightValue;
    }
    if (operatorText === ' < ') {
      return (
        chunk.table !== table ||
        (actual instanceof Date &&
          rightValue instanceof Date &&
          actual.getTime() < rightValue.getTime())
      );
    }
    if (operatorText.toLowerCase().includes(' is null')) {
      return chunk.table !== table || actual == null;
    }
    if (operatorText.toLowerCase().includes(' in ') && Array.isArray(right)) {
      return (
        chunk.table !== table ||
        right.filter(isParam).some((param) => actual === param.value)
      );
    }
  }

  return true;
}

function extractChunkText(chunk: unknown): string {
  if (
    chunk &&
    typeof chunk === 'object' &&
    'value' in chunk &&
    Array.isArray((chunk as { value?: unknown }).value)
  ) {
    return (chunk as { value: string[] }).value.join('');
  }
  return '';
}

function extractRightValue(right: unknown): unknown {
  if (isParam(right)) {
    return right.value;
  }
  if (
    typeof right === 'string' ||
    typeof right === 'number' ||
    typeof right === 'boolean' ||
    right instanceof Date
  ) {
    return right;
  }
  return undefined;
}

function project(
  selection: Selection,
  table: Table,
  row: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(selection).map(([key, column]) => {
      if (isColumn(column)) {
        return [key, row[propertyName(column.name)]];
      }
      if (key === 'userId' && table === employee) {
        return [key, row.employeeId];
      }
      if (key === 'departmentId' && table === employee) {
        return [key, row.departmentId];
      }
      if (key === 'id' && table === department) {
        return [key, row.id];
      }
      if (key === 'roleBizId' && table === rolePermissionConfig) {
        return [key, row.roleBizId];
      }
      if (key === 'permissions' && table === rolePermissionConfig) {
        return [key, row.permissions];
      }
      return [key, row[key]];
    }),
  );
}

export class QueryBackedDb {
  constructor(
    public readonly data: {
      employees?: FakeEmployeeRow[];
      departments?: FakeDepartmentRow[];
      rolePermissionConfigs?: FakePermissionConfigRow[];
    } = {},
  ) {}

  select = jest.fn((selection: Selection) => {
    const query = {
      table: undefined as Table | undefined,
      condition: undefined as unknown,
      orderColumn: undefined as { name: string } | undefined,
      from: jest.fn((table: Table) => {
        query.table = table;
        return query;
      }),
      where: jest.fn((condition: unknown) => {
        query.condition = condition;
        return query;
      }),
      orderBy: jest.fn((column: { name: string }) => {
        query.orderColumn = column;
        return query;
      }),
      limit: jest.fn(async (limit: number) => {
        const rows = this.queryRows(query);
        return rows
          .slice(0, limit)
          .map((row) => project(selection, query.table!, row));
      }),
      then: (
        resolve: (value: Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => {
        const rows = this.queryRows(query);
        return Promise.resolve(
          rows.map((row) => project(selection, query.table!, row)),
        ).then(resolve, reject);
      },
    };
    return query;
  });

  private rows(table: Table | undefined): Record<string, unknown>[] {
    if (table === department) return this.data.departments ?? [];
    if (table === rolePermissionConfig)
      return this.data.rolePermissionConfigs ?? [];
    return this.data.employees ?? [];
  }

  private queryRows(query: {
    table: Table | undefined;
    condition: unknown;
    orderColumn: { name: string } | undefined;
  }): Record<string, unknown>[] {
    const rows = this.rows(query.table).filter((row) =>
      matches(query.table!, row, query.condition),
    );
    if (!query.orderColumn) return rows;
    const key = propertyName(query.orderColumn.name);
    return [...rows].sort((left, right) =>
      String(left[key] ?? '').localeCompare(String(right[key] ?? '')),
    );
  }
}
