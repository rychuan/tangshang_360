/* eslint-disable */
/** auto generated, do not edit */
import { pgTable, index, pgPolicy, varchar, integer, jsonb, uuid, boolean, numeric, text, customType } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

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

/** Escape single quotes in SQL string literals */
function escapeLiteral(str: string): string {
  return `'${str.replace(/'/g, "''")}'`;
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

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number};
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number){
    if(value == null) return value as any;
    if (typeof value === 'number') {
      return new Date(value).toISOString();
    }
    if(typeof value === 'string') {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if(value instanceof Date) return value;
    return new Date(value);
  },
});

export const employee = pgTable("employee", {
  id: userProfile("id").notNull(),
  name: varchar({ length: 255 }).notNull(),
  position: varchar({ length: 255 }).notNull(),
  department: varchar({ length: 255 }).notNull(),
  supervisorId: userProfile("supervisor_id"),
  status: varchar({ length: 255 }).default('active').notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  employeeNo: varchar("employee_no", { length: 50 }),
  title: varchar({ length: 100 }),
  role: varchar({ length: 50 }).default('employee'),
  phone: varchar({ length: 50 }),
  hireDate: customTimestamptz('hire_date'),
  probationMonths: integer("probation_months").default(3),
  permissions: jsonb(),
  deletedAt: customTimestamptz('deleted_at'),
}, (table) => [
  index("idx_employee_supervisor").using("btree", sql`((supervisor_id).user_id)`),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const assessmentTemplate = pgTable("assessment_template", {
  id: uuid().defaultRandom().notNull(),
  name: varchar({ length: 255 }).notNull(),
  position: varchar({ length: 255 }).notNull(),
  type: varchar({ length: 255 }).default('monthly').notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const assessmentDimension = pgTable("assessment_dimension", {
  id: uuid().defaultRandom().notNull(),
  templateId: uuid("template_id").notNull(),
  name: varchar({ length: 255 }).notNull(),
  weight: numeric().default('0').notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_dimension_template").using("btree", table.templateId.asc().nullsLast().op("uuid_ops")),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const assessmentInstance = pgTable("assessment_instance", {
  id: uuid().defaultRandom().notNull(),
  period: varchar({ length: 255 }).notNull(),
  employeeId: userProfile("employee_id").notNull(),
  supervisorId: userProfile("supervisor_id"),
  position: varchar({ length: 255 }).notNull(),
  templateId: uuid("template_id").notNull(),
  totalScore: numeric("total_score"),
  grade: varchar({ length: 255 }),
  status: varchar({ length: 255 }).default('self_review').notNull(),
  selfSignName: varchar("self_sign_name", { length: 255 }),
  selfSignAt: customTimestamptz('self_sign_at'),
  supervisorSignName: varchar("supervisor_sign_name", { length: 255 }),
  supervisorSignAt: customTimestamptz('supervisor_sign_at'),
  publishedBy: userProfile("published_by"),
  publishedAt: customTimestamptz('published_at'),
  completedAt: customTimestamptz('completed_at'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  selfSignImage: text("self_sign_image"),
  supervisorSignImage: text("supervisor_sign_image"),
}, (table) => [
  index("idx_instance_employee").using("btree", sql`((employee_id).user_id)`),
  index("idx_instance_period").using("btree", table.period.asc().nullsLast().op("text_ops")),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const assessmentIndicator = pgTable("assessment_indicator", {
  id: uuid().defaultRandom().notNull(),
  dimensionId: uuid("dimension_id").notNull(),
  content: varchar({ length: 255 }).notNull(),
  description: text(),
  algorithm: text(),
  dataSource: varchar("data_source", { length: 255 }),
  maxScore: numeric("max_score").default('0').notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_indicator_dimension").using("btree", table.dimensionId.asc().nullsLast().op("uuid_ops")),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const employeeBinding = pgTable("employee_binding", {
  id: uuid().defaultRandom().notNull(),
  employeeId: userProfile("employee_id").notNull(),
  templateId: uuid("template_id").notNull(),
  effectiveFrom: varchar("effective_from", { length: 255 }).notNull(),
  status: varchar({ length: 255 }).default('active').notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_binding_employee").using("btree", sql`((employee_id).user_id)`),
  index("idx_binding_template").using("btree", table.templateId.asc().nullsLast().op("uuid_ops")),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const assessmentIndicatorSnapshot = pgTable("assessment_indicator_snapshot", {
  id: uuid().defaultRandom().notNull(),
  instanceId: uuid("instance_id").notNull(),
  dimensionName: varchar("dimension_name", { length: 255 }).notNull(),
  dimensionWeight: numeric("dimension_weight").default('0').notNull(),
  content: varchar({ length: 255 }).notNull(),
  description: text(),
  algorithm: text(),
  dataSource: varchar("data_source", { length: 255 }),
  maxScore: numeric("max_score").default('0').notNull(),
  isAdjusted: boolean("is_adjusted").default(false).notNull(),
  adjustedBy: userProfile("adjusted_by"),
  adjustedAt: customTimestamptz('adjusted_at'),
  sortOrder: integer("sort_order").default(0).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_snapshot_instance").using("btree", table.instanceId.asc().nullsLast().op("uuid_ops")),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const rolePermissionConfig = pgTable("role_permission_config", {
  id: uuid().defaultRandom().notNull(),
  roleBizId: varchar("role_biz_id", { length: 100 }).notNull(),
  /**
   * @type { resource: string; actions: string[] }
   */
  permissions: jsonb().default([]).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`((current_setting('app.user_id'::text) = ANY (ARRAY[]::text[])) AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text))` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const ratingRecord = pgTable("rating_record", {
  id: uuid().defaultRandom().notNull(),
  instanceId: uuid("instance_id").notNull(),
  indicatorSnapshotId: uuid("indicator_snapshot_id").notNull(),
  ratingType: varchar("rating_type", { length: 255 }).notNull(),
  score: numeric().default('0').notNull(),
  comment: text(),
  ratedBy: userProfile("rated_by").notNull(),
  submittedAt: customTimestamptz('submitted_at'),
  isDraft: boolean("is_draft").default(true).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_rating_instance").using("btree", table.instanceId.asc().nullsLast().op("uuid_ops")),
  index("idx_rating_snapshot").using("btree", table.indicatorSnapshotId.asc().nullsLast().op("uuid_ops")),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const auditLog = pgTable("audit_log", {
  id: uuid().defaultRandom().notNull(),
  operatorId: userProfile("operator_id"),
  action: varchar({ length: 255 }).notNull(),
  targetType: varchar("target_type", { length: 255 }).notNull(),
  targetId: varchar("target_id", { length: 255 }).notNull(),
  /**
   * 变更前后对比
   *
   * @type { before?: object; after?: object }
   */
  changes: jsonb(),
  reason: varchar({ length: 255 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`(current_setting('app.user_id'::text) = ((_created_by).user_id)::text)` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

export const department = pgTable("department", {
  id: uuid().defaultRandom().notNull(),
  name: varchar({ length: 255 }).notNull(),
  parentId: uuid("parent_id"),
  headId: userProfile("head_id"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_department_parent").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
]);

export const performanceGrade = pgTable("performance_grade", {
  id: uuid().defaultRandom().notNull(),
  name: varchar({ length: 255 }).notNull(),
  minScore: integer("min_score").notNull(),
  maxScore: integer("max_score").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_performance_grade_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"], using: sql`((current_setting('app.user_id'::text) = ANY (ARRAY[]::text[])) AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text))` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_aadkdb3hk7kmu", "authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_aadkdb3hk7kmu"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_aadkdb3hk7kmu"] }),
]);

// table aliases
export const assessmentDimensionTable = assessmentDimension;
export const assessmentIndicatorTable = assessmentIndicator;
export const assessmentIndicatorSnapshotTable = assessmentIndicatorSnapshot;
export const assessmentInstanceTable = assessmentInstance;
export const assessmentTemplateTable = assessmentTemplate;
export const auditLogTable = auditLog;
export const departmentTable = department;
export const employeeTable = employee;
export const employeeBindingTable = employeeBinding;
export const performanceGradeTable = performanceGrade;
export const ratingRecordTable = ratingRecord;
export const rolePermissionConfigTable = rolePermissionConfig;
