import { and, inArray } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { assessmentInstance } from '@server/database/schema';
import { buildEmployeeIdInCondition } from './employee-scope-condition';

describe('buildEmployeeIdInCondition', () => {
  it('keeps the complete employee scope under the period condition', () => {
    const employeeCondition = buildEmployeeIdInCondition(
      assessmentInstance.employeeId,
      ['employee-a', 'employee-b'],
    );
    const condition = and(
      employeeCondition,
      inArray(assessmentInstance.period, ['2026-07']),
    );

    const query = new PgDialect().sqlToQuery(condition!);

    expect(query.sql).toContain('user_id IN ($1, $2)');
    expect(query.sql).not.toContain(' OR ');
    expect(query.params).toEqual(['employee-a', 'employee-b', '2026-07']);
  });
});
