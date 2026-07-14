import { sql } from 'drizzle-orm';
import { assessmentInstance } from '@server/database/schema';

export function buildEmployeeIdInCondition(
  col: typeof assessmentInstance.employeeId,
  ids: string[],
) {
  if (ids.length === 0) return sql`FALSE`;

  return sql`(${col}).user_id IN (${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`;
}
