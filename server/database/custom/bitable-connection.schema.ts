import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  jsonb,
  text,
} from 'drizzle-orm/pg-core';
import { customTimestamptz, userProfile } from '../schema';
import { sql } from 'drizzle-orm';

export const bitableConnection = pgTable('bitable_connection', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  appId: varchar('app_id', { length: 100 }).notNull(),
  appSecret: text('app_secret').notNull(),
  bitableAppToken: varchar('bitable_app_token', { length: 200 }).notNull(),
  tableId: varchar('table_id', { length: 200 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: userProfile('_created_by'),
  createdAt: customTimestamptz('_created_at', { precision: 6 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: customTimestamptz('_updated_at', { precision: 6 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedBy: userProfile('_updated_by'),
  deletedAt: customTimestamptz('deleted_at', { precision: 6 }),
});

export const bitableSyncLog = pgTable('bitable_sync_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  connectionId: uuid('connection_id').notNull(),
  direction: varchar('direction', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  totalCount: integer('total_count').default(0),
  createdCount: integer('created_count').default(0),
  updatedCount: integer('updated_count').default(0),
  skippedCount: integer('skipped_count').default(0),
  failedCount: integer('failed_count').default(0),
  details: jsonb('details'),
  errorMessage: text('error_message'),
  operatorId: userProfile('operator_id').notNull(),
  startedAt: customTimestamptz('started_at', { precision: 6 }).notNull(),
  completedAt: customTimestamptz('completed_at', { precision: 6 }),
});
