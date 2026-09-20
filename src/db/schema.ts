import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

/** Expo floor hours, as display strings so an admin can write "TBD" or "9:30 am". */
export interface ExpoHourSlot {
  day: string
  opens: string
  closes: string
}

export type ExpoHours = ExpoHourSlot[]

export const applicationStatus = pgEnum('application_status', [
  'submitted',
  'under_review',
  'info_requested',
  'waitlisted',
  'accepted',
  'confirmed',
  'rejected',
  'withdrawn',
])

export const messageDirection = pgEnum('message_direction', ['outbound', 'inbound'])
export const outboxStatus = pgEnum('outbox_status', ['pending', 'sending', 'sent', 'failed'])
export const tokenPurpose = pgEnum('token_purpose', ['admin_login', 'applicant_portal'])
export const subjectType = pgEnum('subject_type', ['admin', 'applicant'])

export const admins = pgTable(
  'admins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    invitedBy: uuid('invited_by'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('admins_email_key').on(t.email)],
)

export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    applicationsOpenAt: timestamp('applications_open_at', { withTimezone: true }).notNull(),
    applicationsCloseAt: timestamp('applications_close_at', { withTimezone: true }).notNull(),
    boothCap: integer('booth_cap').notNull().default(40),
    lateCancellationFeeCents: integer('late_cancellation_fee_cents').notNull().default(100000),
    termsText: text('terms_text').notNull(),
    termsVersion: integer('terms_version').notNull().default(1),
    expoHours: jsonb('expo_hours').$type<ExpoHours>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => admins.id),
  },
  (t) => [check('settings_singleton', sql`${t.id} = 1`)],
)

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgName: text('org_name').notNull(),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    website: text('website').notNull(),
    about: text('about').notNull(),
    showcase: text('showcase').notNull(),
    communityImpact: text('community_impact').notNull(),
    staffingPlan: text('staffing_plan').notNull(),
    signText: text('sign_text').notNull(),
    logoUploadId: uuid('logo_upload_id'),
    status: applicationStatus('status').notNull().default('submitted'),
    boothNumber: text('booth_number'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => admins.id),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedByName: text('confirmed_by_name'),
    confirmedTermsSnapshot: text('confirmed_terms_snapshot'),
    confirmedTermsVersion: integer('confirmed_terms_version'),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  },
  (t) => [
    index('applications_status_idx').on(t.status),
    index('applications_email_idx').on(t.contactEmail),
  ],
)

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    data: bytea('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('uploads_application_idx').on(t.applicationId)],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    direction: messageDirection('direction').notNull(),
    authorAdminId: uuid('author_admin_id').references(() => admins.id),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    emailOutboxId: uuid('email_outbox_id'),
    readByAdminAt: timestamp('read_by_admin_at', { withTimezone: true }),
  },
  (t) => [index('messages_application_idx').on(t.applicationId, t.createdAt)],
)

export const internalNotes = pgTable(
  'internal_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('internal_notes_application_idx').on(t.applicationId)],
)

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    toEmail: text('to_email').notNull(),
    fromEmail: text('from_email').notNull(),
    replyTo: text('reply_to'),
    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),
    bodyHtml: text('body_html').notNull(),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_outbox_dispatch_idx').on(t.status, t.nextAttemptAt)],
)

export const emailTemplates = pgTable('email_templates', {
  key: text('key').primaryKey(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  variables: jsonb('variables').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => admins.id),
})

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    purpose: tokenPurpose('purpose').notNull(),
    adminId: uuid('admin_id').references(() => admins.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    requestedIp: text('requested_ip'),
  },
  (t) => [uniqueIndex('auth_tokens_hash_key').on(t.tokenHash)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    subjectType: subjectType('subject_type').notNull(),
    adminId: uuid('admin_id').references(() => admins.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sessions_hash_key').on(t.tokenHash)],
)

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorType: text('actor_type').notNull(),
    actorId: uuid('actor_id'),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_application_idx').on(t.applicationId, t.createdAt)],
)
