/* eslint-disable */
/** auto generated, do not edit */
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, uuid, varchar, customType } from "drizzle-orm/pg-core"

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number };
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number) {
    if (value == null) return value as any;
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString();
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if (value instanceof Date) return value;
    return new Date(value);
  },
});

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

export function escapeLiteral(str: string): string {
  return "'" + str.replace(/'/g, "''") + "'";
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const bitableSyncLog = pgTable("bitable_sync_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id").notNull(),
  direction: varchar("direction", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  totalCount: integer("total_count").default(0),
  createdCount: integer("created_count").default(0),
  updatedCount: integer("updated_count").default(0),
  skippedCount: integer("skipped_count").default(0),
  failedCount: integer("failed_count").default(0),
  details: jsonb("details"),
  errorMessage: text("error_message"),
  operatorId: userProfile("operator_id").notNull(),
  startedAt: customTimestamptz("started_at", { precision: 6 }).notNull(),
  completedAt: customTimestamptz("completed_at", { precision: 6 }),
});

export const bitableConnection = pgTable("bitable_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  appId: varchar("app_id", { length: 100 }).notNull(),
  appSecret: text("app_secret").notNull(),
  bitableAppToken: varchar("bitable_app_token", { length: 200 }).notNull(),
  tableId: varchar("table_id", { length: 200 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: customTimestamptz("deleted_at", { precision: 6 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const systemDict = pgTable("system_dict", {
  id: uuid("id").primaryKey().defaultRandom(),
  dictType: varchar("dict_type", { length: 50 }).notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
});

export const employeeIndicatorSnapshot = pgTable("employee_indicator_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: userProfile("employee_id").notNull(),
  templateId: uuid("template_id").notNull(),
  dimensionName: varchar("dimension_name", { length: 255 }).notNull(),
  dimensionWeight: numeric("dimension_weight").notNull().default('0'),
  content: varchar("content", { length: 255 }).notNull(),
  description: text("description"),
  algorithm: text("algorithm"),
  dataSource: varchar("data_source", { length: 255 }),
  weight: numeric("weight").notNull().default('0'),
  isAdjusted: boolean("is_adjusted").notNull().default(false),
  adjustedBy: userProfile("adjusted_by"),
  adjustedAt: customTimestamptz("adjusted_at", { precision: 6 }),
  sortOrder: integer("sort_order").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by").default(sql`CASE
    WHEN (current_setting('app.user_id'::text, true) = ''::text) THEN NULL`),
}, (table) => [
  // Complex index: CREATE INDEX idx_emp_snapshot_employee ON employee_indicator_snapshot USING btree (((employee_id).user_id)),
  index("idx_emp_snapshot_template").on(table.templateId),
]);

// Synced table: data is auto-synced from external source. Do not rename or delete this table.
export const performanceGrade = pgTable("performance_grade", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Synced field: auto-synced, do not modify or delete
  name: varchar("name", { length: 255 }).notNull(),
  // Synced field: auto-synced, do not modify or delete
  minScore: integer("min_score").notNull(),
  // Synced field: auto-synced, do not modify or delete
  maxScore: integer("max_score").notNull(),
  // Synced field: auto-synced, do not modify or delete
  sortOrder: integer("sort_order").notNull().default(0),
  // Synced field: auto-synced, do not modify or delete
  isActive: boolean("is_active").notNull().default(true),
  // Synced field: auto-synced, do not modify or delete
  coefficient: varchar("coefficient", { length: 255 }),
  // Synced field: auto-synced, do not modify or delete
  baseRecordId: varchar("base_record_id").unique(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_performance_grade_active").on(table.isActive),
  uniqueIndex("unq_1869602962688083").on(table.baseRecordId),
]);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  operatorId: userProfile("operator_id"),
  action: varchar("action", { length: 255 }).notNull(),
  targetType: varchar("target_type", { length: 255 }).notNull(),
  targetId: varchar("target_id", { length: 255 }).notNull(),
  changes: jsonb("changes"),
  reason: varchar("reason", { length: 255 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const ratingRecord = pgTable("rating_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id").notNull(),
  indicatorSnapshotId: uuid("indicator_snapshot_id").notNull(),
  ratingType: varchar("rating_type", { length: 255 }).notNull(),
  score: numeric("score").notNull().default('0'),
  comment: text("comment"),
  ratedBy: userProfile("rated_by").notNull(),
  submittedAt: customTimestamptz("submitted_at", { precision: 6 }),
  isDraft: boolean("is_draft").notNull().default(true),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_rating_instance").on(table.instanceId),
  index("idx_rating_snapshot").on(table.indicatorSnapshotId),
]);

export const rolePermissionConfig = pgTable("role_permission_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleBizId: varchar("role_biz_id", { length: 100 }).notNull(),
  permissions: jsonb("permissions").notNull().default('[]'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const assessmentIndicatorSnapshot = pgTable("assessment_indicator_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  instanceId: uuid("instance_id").notNull(),
  dimensionName: varchar("dimension_name", { length: 255 }).notNull(),
  dimensionWeight: numeric("dimension_weight").notNull().default('0'),
  content: varchar("content", { length: 255 }).notNull(),
  description: text("description"),
  algorithm: text("algorithm"),
  dataSource: varchar("data_source", { length: 255 }),
  weight: numeric("weight").notNull().default('0'),
  isAdjusted: boolean("is_adjusted").notNull().default(false),
  adjustedBy: userProfile("adjusted_by"),
  adjustedAt: customTimestamptz("adjusted_at", { precision: 6 }),
  sortOrder: integer("sort_order").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_snapshot_instance").on(table.instanceId),
]);

export const assessmentInstance = pgTable("assessment_instance", {
  id: uuid("id").primaryKey().defaultRandom(),
  period: varchar("period", { length: 255 }).notNull(),
  employeeId: userProfile("employee_id").notNull(),
  supervisorId: userProfile("supervisor_id"),
  position: varchar("position", { length: 255 }).notNull(),
  templateId: uuid("template_id").notNull(),
  totalScore: numeric("total_score"),
  grade: varchar("grade", { length: 255 }),
  status: varchar("status", { length: 255 }).notNull().default('self_review'),
  selfSignName: varchar("self_sign_name", { length: 255 }),
  selfSignAt: customTimestamptz("self_sign_at", { precision: 6 }),
  supervisorSignName: varchar("supervisor_sign_name", { length: 255 }),
  supervisorSignAt: customTimestamptz("supervisor_sign_at", { precision: 6 }),
  publishedBy: userProfile("published_by"),
  publishedAt: customTimestamptz("published_at", { precision: 6 }),
  completedAt: customTimestamptz("completed_at", { precision: 6 }),
  selfSignImage: text("self_sign_image"),
  supervisorSignImage: text("supervisor_sign_image"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  // Complex index: CREATE INDEX idx_instance_employee ON assessment_instance USING btree (((employee_id).user_id)),
  index("idx_instance_period").on(table.period),
]);

export const department = pgTable("department", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  parentId: uuid("parent_id"),
  headId: userProfile("head_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_department_parent").on(table.parentId),
]);

export const employeeBinding = pgTable("employee_binding", {
  id: uuid("id").primaryKey().defaultRandom(),
  employeeId: userProfile("employee_id").notNull(),
  templateId: uuid("template_id").notNull(),
  effectiveFrom: varchar("effective_from", { length: 255 }).notNull(),
  status: varchar("status", { length: 255 }).notNull().default('active'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  // Complex index: CREATE INDEX idx_binding_employee ON employee_binding USING btree (((employee_id).user_id)),
  index("idx_binding_template").on(table.templateId),
]);

export const assessmentIndicator = pgTable("assessment_indicator", {
  id: uuid("id").primaryKey().defaultRandom(),
  dimensionId: uuid("dimension_id").notNull(),
  content: varchar("content", { length: 255 }).notNull(),
  description: text("description"),
  algorithm: text("algorithm"),
  dataSource: varchar("data_source", { length: 255 }),
  weight: numeric("weight").notNull().default('0'),
  sortOrder: integer("sort_order").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_indicator_dimension").on(table.dimensionId),
]);

export const assessmentDimension = pgTable("assessment_dimension", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  weight: numeric("weight").notNull().default('0'),
  sortOrder: integer("sort_order").notNull().default(0),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_dimension_template").on(table.templateId),
]);

export const assessmentTemplate = pgTable("assessment_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  position: varchar("position", { length: 255 }).notNull(),
  type: varchar("type", { length: 255 }).notNull().default('monthly'),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt: customTimestamptz("deleted_at", { precision: 6 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
});

export const employee = pgTable("employee", {
  employeeId: userProfile("employee_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  position: varchar("position", { length: 255 }).notNull(),
  department: varchar("department", { length: 255 }).notNull(),
  supervisorId: userProfile("supervisor_id"),
  status: varchar("status", { length: 255 }).notNull().default('active'),
  employeeNo: varchar("employee_no", { length: 50 }),
  title: varchar("title", { length: 100 }),
  role: varchar("role", { length: 50 }).default('employee'),
  phone: varchar("phone", { length: 50 }),
  hireDate: customTimestamptz("hire_date", { precision: 6 }),
  probationMonths: integer("probation_months").default(3),
  permissions: jsonb("permissions"),
  deletedAt: customTimestamptz("deleted_at", { precision: 6 }),
  bitableConnectionId: uuid("bitable_connection_id"),
  id: uuid("id").primaryKey().defaultRandom(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz("_created_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz("_updated_at", { precision: 6 }).notNull().default(sql`CURRENT_TIMESTAMP`),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  // Complex index: CREATE INDEX idx_employee_supervisor ON employee USING btree (((supervisor_id).user_id)),
  // Complex index: CREATE UNIQUE INDEX idx_employee_pk ON employee USING btree (((employee_id).user_id)),
]);

// table aliases
export const assessmentDimensionTable = assessmentDimension;
export const assessmentIndicatorTable = assessmentIndicator;
export const assessmentIndicatorSnapshotTable = assessmentIndicatorSnapshot;
export const assessmentInstanceTable = assessmentInstance;
export const assessmentTemplateTable = assessmentTemplate;
export const auditLogTable = auditLog;
export const bitableConnectionTable = bitableConnection;
export const bitableSyncLogTable = bitableSyncLog;
export const departmentTable = department;
export const employeeTable = employee;
export const employeeBindingTable = employeeBinding;
export const employeeIndicatorSnapshotTable = employeeIndicatorSnapshot;
export const performanceGradeTable = performanceGrade;
export const ratingRecordTable = ratingRecord;
export const rolePermissionConfigTable = rolePermissionConfig;
export const systemDictTable = systemDict;
