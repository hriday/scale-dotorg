# Plan A — Foundation and Public Application

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A branded, SCaLE-styled public site where an open source project can submit a community booth application, and receive a receipt email containing a link back to it.

**Architecture:** One Next.js App Router application in TypeScript talking to Postgres through Drizzle. Server actions validate with Zod on the server and persist. Email goes through an `EmailSender` interface with console, SMTP (Mailpit locally), and SMTP2GO REST implementations, and is always written to a transactional outbox in the same database transaction as the change that caused it.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Drizzle ORM, postgres.js, Zod 4, nodemailer, Vitest, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-19-scale-dotorg-booths-design.md`

## Global Constraints

- Event is SCaLE 24x, April 1–4 2027, Pasadena Convention Center, 300 E Green St, Pasadena CA 91101.
- Expo floor: Fri Apr 2 13:00–17:00; Sat Apr 3 TBD–17:00; Sun Apr 4 TBD–12:00. Saturday and Sunday opening times are unknown — render them as `TBD` from a single constant, never hardcoded inline.
- Program is named **Community Booths** in all user-facing copy. All copy lives in `src/copy.ts` so a rename is one file.
- Outbound mail is from `dotorgs@socallinuxexpo.org`, Reply-To the same.
- Late cancellation fee is $1,000, stored as `100000` cents in settings, never hardcoded in copy.
- Brand tokens, exact values: primary `#1d71f0`, hover `#1a66d8`, dark `#175ac0`, light `#4a8df3`, pale `#a5c6f9`, accent `#f0b100`, accent-mid `#f3c133`, accent-pale `#f9e099`, ink `#222`, muted `#4e4e4e`, rules `#a7a7a7`, on white.
- Typeface is Outfit, self-hosted from `public/fonts/`. Never fetch fonts from a remote host at build or run time.
- Logo upload cap is 2 MB. Accepted: PNG, JPEG, SVG, PDF.
- `sign_text` is capped at 60 characters.
- Long-form text fields (`about`, `showcase`, `community_impact`, `staffing_plan`) are 100–2000 characters.
- Emails are stored lowercased; compare only lowercased.
- Auth tokens are stored as SHA-256 hashes. A raw token exists only in an email.
- Every "we sent you a link" response is byte-identical whether or not the address exists.

## Deviations from the spec, and why

- **`citext` → lowercased `text` + unique index.** Avoids requiring a Postgres extension and a Drizzle `customType` for a property we can guarantee in code. Normalization happens in one place (`normalizeEmail`) and is unit tested.
- **Three senders, not two.** The spec names SMTP2GO REST and a dev sender. Mailpit is reached over SMTP, so there is a `SmtpSender` (nodemailer) used locally and a `Smtp2goSender` (REST) used in production, plus `ConsoleSender` for tests.

---

### Task 1: Project scaffold, validated environment, health check

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.env.example`, `docker-compose.yml`
- Create: `src/env.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/app/healthz/route.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseEnv(raw: Record<string, string | undefined>): Env` and `getEnv(): Env` from `src/env.ts`. `Env` has fields `DATABASE_URL: string`, `SESSION_SECRET: string`, `PUBLIC_BASE_URL: string`, `MAIL_FROM: string`, `EMAIL_SENDER: 'console' | 'smtp' | 'smtp2go'`, `SMTP_HOST?: string`, `SMTP_PORT?: number`, `SMTP2GO_API_KEY?: string`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "scale-community-booths",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts",
    "e2e": "playwright test"
  },
  "dependencies": {
    "next": "^15.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "drizzle-orm": "^0.44.0",
    "postgres": "^3.4.5",
    "zod": "^4.0.0",
    "nodemailer": "^7.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@types/nodemailer": "^6.4.17",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "drizzle-kit": "^0.31.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0",
    "@playwright/test": "^1.50.0"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Create `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
}

export default nextConfig
```

`postcss.config.mjs`:

```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
```

- [ ] **Step 3: Write the failing test**

`tests/unit/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseEnv } from '@/env'

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  SESSION_SECRET: 'x'.repeat(32),
  PUBLIC_BASE_URL: 'http://localhost:3000',
  MAIL_FROM: 'dotorgs@socallinuxexpo.org',
  EMAIL_SENDER: 'console',
}

describe('parseEnv', () => {
  it('accepts a valid console configuration', () => {
    const env = parseEnv(base)
    expect(env.EMAIL_SENDER).toBe('console')
    expect(env.MAIL_FROM).toBe('dotorgs@socallinuxexpo.org')
  })

  it('rejects a session secret shorter than 32 characters', () => {
    expect(() => parseEnv({ ...base, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/)
  })

  it('refuses to boot with EMAIL_SENDER=smtp2go and no API key', () => {
    expect(() => parseEnv({ ...base, EMAIL_SENDER: 'smtp2go' })).toThrow(/SMTP2GO_API_KEY/)
  })

  it('refuses to boot with EMAIL_SENDER=smtp and no host', () => {
    expect(() => parseEnv({ ...base, EMAIL_SENDER: 'smtp' })).toThrow(/SMTP_HOST/)
  })

  it('coerces SMTP_PORT to a number', () => {
    const env = parseEnv({ ...base, EMAIL_SENDER: 'smtp', SMTP_HOST: 'mailpit', SMTP_PORT: '1025' })
    expect(env.SMTP_PORT).toBe(1025)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: FAIL — cannot resolve `@/env`.

- [ ] **Step 5: Implement `src/env.ts`**

```ts
import { z } from 'zod'

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    PUBLIC_BASE_URL: z.url(),
    MAIL_FROM: z.email(),
    EMAIL_SENDER: z.enum(['console', 'smtp', 'smtp2go']),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP2GO_API_KEY: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.EMAIL_SENDER === 'smtp2go' && !value.SMTP2GO_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP2GO_API_KEY'],
        message: 'SMTP2GO_API_KEY is required when EMAIL_SENDER=smtp2go',
      })
    }
    if (value.EMAIL_SENDER === 'smtp' && !value.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_SENDER=smtp',
      })
    }
  })

export type Env = z.infer<typeof schema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid environment: ${detail}`)
  }
  return result.data
}

let cached: Env | undefined

export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/env.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Create the minimal app shell and health check**

`src/app/globals.css`:

```css
@import "tailwindcss";
```

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Community Booths — SCaLE 24x',
  description: 'Apply for a community booth at the Southern California Linux Expo.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

`src/app/page.tsx`:

```tsx
export default function Home() {
  return <main>Community Booths</main>
}
```

`src/app/healthz/route.ts`:

```ts
export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ status: 'ok' })
}
```

- [ ] **Step 8: Create `.env.example` and `docker-compose.yml`**

`.env.example`:

```
DATABASE_URL=postgres://booths:booths@localhost:5432/booths
SESSION_SECRET=change-me-to-at-least-32-random-characters
PUBLIC_BASE_URL=http://localhost:3000
MAIL_FROM=dotorgs@socallinuxexpo.org
EMAIL_SENDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
# EMAIL_SENDER=smtp2go
# SMTP2GO_API_KEY=
```

`docker-compose.yml`:

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: booths
      POSTGRES_PASSWORD: booths
      POSTGRES_DB: booths
    ports: ['5432:5432']
    volumes: ['booths-db:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U booths']
      interval: 5s
      timeout: 3s
      retries: 10

  mailpit:
    image: axllent/mailpit:latest
    ports: ['1025:1025', '8025:8025']

volumes:
  booths-db:
```

- [ ] **Step 9: Verify the app boots and the health check answers**

Run: `docker compose up -d && cp .env.example .env && npm run dev`
Then: `curl -s localhost:3000/healthz`
Expected: `{"status":"ok"}`. Mailpit's inbox loads at `http://localhost:8025`.
Stop the dev server before continuing.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with validated environment and health check"
```

---

### Task 2: Database schema and migrations

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/migrate.ts`, `drizzle.config.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Consumes: `getEnv()` from `src/env.ts`.
- Produces: every table object from `src/db/schema.ts` (`settings`, `admins`, `applications`, `uploads`, `messages`, `internalNotes`, `emailOutbox`, `emailTemplates`, `authTokens`, `sessions`, `auditLog`), the `applicationStatus` enum, and `getDb(): PostgresJsDatabase<typeof schema>` from `src/db/client.ts`.

- [ ] **Step 1: Write the failing test**

`tests/integration/schema.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, closeDb } from '@/db/client'
import { applications, settings, uploads } from '@/db/schema'

const db = getDb()

afterAll(async () => {
  await closeDb()
})

describe('schema', () => {
  it('stores an application and reads it back', async () => {
    const [row] = await db
      .insert(applications)
      .values({
        orgName: 'Debian',
        contactName: 'A Maintainer',
        contactEmail: 'maintainer@example.org',
        website: 'https://www.debian.org',
        about: 'a'.repeat(120),
        showcase: 'b'.repeat(120),
        communityImpact: 'c'.repeat(120),
        staffingPlan: 'd'.repeat(120),
        signText: 'Debian',
      })
      .returning()

    expect(row.status).toBe('submitted')
    expect(row.submittedAt).toBeInstanceOf(Date)

    const found = await db.query.applications.findFirst({ where: eq(applications.id, row.id) })
    expect(found?.orgName).toBe('Debian')

    await db.delete(applications).where(eq(applications.id, row.id))
  })

  it('stores binary logo data', async () => {
    const [app] = await db
      .insert(applications)
      .values({
        orgName: 'EFF',
        contactName: 'Someone',
        contactEmail: 'someone@example.org',
        website: 'https://www.eff.org',
        about: 'a'.repeat(120),
        showcase: 'b'.repeat(120),
        communityImpact: 'c'.repeat(120),
        staffingPlan: 'd'.repeat(120),
        signText: 'EFF',
      })
      .returning()

    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const [upload] = await db
      .insert(uploads)
      .values({
        applicationId: app.id,
        filename: 'logo.png',
        contentType: 'image/png',
        byteSize: bytes.length,
        sha256: 'deadbeef',
        data: bytes,
      })
      .returning()

    expect(Buffer.from(upload.data)).toEqual(bytes)

    await db.delete(applications).where(eq(applications.id, app.id))
  })

  it('rejects a settings row with an id other than 1', async () => {
    await expect(
      db.insert(settings).values({
        id: 2,
        applicationsOpenAt: new Date('2026-10-01T00:00:00Z'),
        applicationsCloseAt: new Date('2027-01-15T23:59:59Z'),
        termsText: 'terms',
      }),
    ).rejects.toThrow(/settings_singleton/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/schema.test.ts`
Expected: FAIL — cannot resolve `@/db/client`.

- [ ] **Step 3: Write `src/db/schema.ts`**

```ts
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

export const emailTemplates = pgTable(
  'email_templates',
  {
    key: text('key').primaryKey(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    variables: jsonb('variables').$type<string[]>().notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid('updated_by').references(() => admins.id),
  },
)

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
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_application_idx').on(t.applicationId, t.createdAt)],
)
```

Note on the `applications.logoUploadId` / `uploads.applicationId` pair: neither carries a Drizzle `references()` back to the other, because that would be a circular FK. `logoUploadId` is a plain `uuid`; a migration in Step 5 adds the one-directional constraint as deferrable.

- [ ] **Step 4: Write `src/db/client.ts` and `drizzle.config.ts`**

`src/db/client.ts`:

```ts
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getEnv } from '@/env'
import * as schema from './schema'

let sql: ReturnType<typeof postgres> | undefined
let db: PostgresJsDatabase<typeof schema> | undefined

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!db) {
    sql = postgres(getEnv().DATABASE_URL, { max: 10 })
    db = drizzle(sql, { schema })
  }
  return db
}

export async function closeDb(): Promise<void> {
  await sql?.end()
  sql = undefined
  db = undefined
}

export type Db = PostgresJsDatabase<typeof schema>
```

`drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 5: Generate migrations and add the deferrable FK**

Run: `npm run db:generate`

Then append to the newest file in `src/db/migrations/`:

```sql
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_logo_upload_id_fk"
  FOREIGN KEY ("logo_upload_id") REFERENCES "uploads"("id")
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
```

- [ ] **Step 6: Write `src/db/migrate.ts`**

```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { closeDb, getDb } from './client'

async function main() {
  await migrate(getDb(), { migrationsFolder: './src/db/migrations' })
  await closeDb()
  console.log('migrations applied')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 7: Apply migrations and run the test**

Run: `docker compose up -d db && npm run db:migrate && npx vitest run tests/integration/schema.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(db): schema and migrations for applications, comms, and auth"
```

---

### Task 3: Copy, event constants, and settings domain

**Files:**
- Create: `src/copy.ts`, `src/event.ts`, `src/domain/settings.ts`
- Test: `tests/unit/settings.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `EVENT` from `src/event.ts`; `COPY` from `src/copy.ts`; from `src/domain/settings.ts`: `type WindowState = 'before' | 'open' | 'closed'`, `windowState(settings: {applicationsOpenAt: Date; applicationsCloseAt: Date}, now: Date): WindowState`, `formatFee(cents: number): string`, and `DEFAULT_TERMS_TEXT: string`.

- [ ] **Step 1: Write the failing test**

`tests/unit/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_TERMS_TEXT, formatFee, windowState } from '@/domain/settings'

const window = {
  applicationsOpenAt: new Date('2026-10-01T00:00:00Z'),
  applicationsCloseAt: new Date('2027-01-15T23:59:59Z'),
}

describe('windowState', () => {
  it('is before the window opens', () => {
    expect(windowState(window, new Date('2026-09-30T23:59:59Z'))).toBe('before')
  })

  it('is open at the opening instant', () => {
    expect(windowState(window, new Date('2026-10-01T00:00:00Z'))).toBe('open')
  })

  it('is open inside the window', () => {
    expect(windowState(window, new Date('2026-12-01T00:00:00Z'))).toBe('open')
  })

  it('is closed after the window', () => {
    expect(windowState(window, new Date('2027-01-16T00:00:01Z'))).toBe('closed')
  })
})

describe('formatFee', () => {
  it('renders whole dollars without cents', () => {
    expect(formatFee(100000)).toBe('$1,000')
  })

  it('renders partial dollars with cents', () => {
    expect(formatFee(99950)).toBe('$999.50')
  })
})

describe('DEFAULT_TERMS_TEXT', () => {
  it('names the contact address', () => {
    expect(DEFAULT_TERMS_TEXT).toContain('dotorgs@socallinuxexpo.org')
  })

  it('does not hardcode the fee amount', () => {
    expect(DEFAULT_TERMS_TEXT).toContain('{{fee}}')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/settings.test.ts`
Expected: FAIL — cannot resolve `@/domain/settings`.

- [ ] **Step 3: Write `src/event.ts`**

```ts
export const TBD = 'TBD' as const

export const EVENT = {
  name: 'SCaLE 24x',
  fullName: '22nd–25th Southern California Linux Expo',
  dates: 'April 1–4, 2027',
  venue: 'Pasadena Convention Center',
  address: '300 E Green St, Pasadena, CA 91101',
  contactEmail: 'dotorgs@socallinuxexpo.org',
  /** Expo floor hours. Saturday and Sunday opening times are not yet published. */
  expoHours: [
    { day: 'Friday, April 2', opens: '1:00 pm', closes: '5:00 pm' },
    { day: 'Saturday, April 3', opens: TBD, closes: '5:00 pm' },
    { day: 'Sunday, April 4', opens: TBD, closes: '12:00 pm' },
  ],
} as const
```

The `fullName` string is a placeholder only in the sense that SCaLE writes it differently year to year; confirm the exact wording with Bala before launch. It is not referenced by any logic.

- [ ] **Step 4: Write `src/copy.ts`**

```ts
import { EVENT } from './event'

export const COPY = {
  programName: 'Community Booths',
  tagline: `Free booth space for open source projects and community groups at ${EVENT.name}.`,
  intro: [
    'One thing that makes SCaLE special is that we mix open source projects and community groups in alongside our commercial sponsors on the expo floor. Your favorite projects sit right next to the companies that depend on them.',
    'Every year we set aside booth space for open source projects and communities to showcase their work, meet their existing community, and find new users and contributors.',
  ],
  provides: [
    'Booth space on the expo floor',
    'Power to the booth',
    'Basic booth furnishings',
    'No cost to your project',
  ],
  expects: [
    'Someone at your booth during all expo floor hours',
    'Something worth an attendee’s time — a demo, a conversation, something to learn',
    'A short write-up of what you plan to show and why it matters',
    'Text for your booth sign and a logo we can print',
  ],
} as const
```

- [ ] **Step 5: Write `src/domain/settings.ts`**

```ts
export type WindowState = 'before' | 'open' | 'closed'

export interface ApplicationWindow {
  applicationsOpenAt: Date
  applicationsCloseAt: Date
}

export function windowState(settings: ApplicationWindow, now: Date): WindowState {
  if (now < settings.applicationsOpenAt) return 'before'
  if (now > settings.applicationsCloseAt) return 'closed'
  return 'open'
}

export function formatFee(cents: number): string {
  const dollars = cents / 100
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const DEFAULT_TERMS_TEXT = `SCaLE provides community booth space, power, and basic booth furnishings at no cost to your organization. In accepting a booth you agree to staff it during all expo floor hours and to notify us as early as possible if your plans change.

Booth space is limited and every booth we hold is one another project cannot have. If you cancel fewer than 30 days before the event, or do not occupy your booth during the show, a late cancellation fee of {{fee}} applies. Cancellations must be made in writing to dotorgs@socallinuxexpo.org.

We would always rather hear from you early than charge this fee. Tell us as soon as you know.`
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/settings.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: event constants, program copy, and application window rules"
```

---

### Task 4: Application validation schemas

**Files:**
- Create: `src/validation/application.ts`, `src/lib/email.ts`
- Test: `tests/unit/validation.test.ts`, `tests/unit/email.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeEmail(raw: string): string` from `src/lib/email.ts`; from `src/validation/application.ts`: `applicationInputSchema` (a Zod object), `type ApplicationInput = z.infer<typeof applicationInputSchema>`, and `LIMITS: { longTextMin: 100; longTextMax: 2000; signTextMax: 60; logoBytesMax: 2_097_152 }`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/email.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeEmail } from '@/lib/email'

describe('normalizeEmail', () => {
  it('lowercases', () => {
    expect(normalizeEmail('Bala@SoCalLinuxExpo.org')).toBe('bala@socallinuxexpo.org')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  bala@socallinuxexpo.org \n')).toBe('bala@socallinuxexpo.org')
  })
})
```

`tests/unit/validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { LIMITS, applicationInputSchema } from '@/validation/application'

const valid = {
  orgName: 'Debian',
  contactName: 'A Maintainer',
  contactEmail: 'Maintainer@Example.ORG',
  website: 'https://www.debian.org',
  about: 'a'.repeat(120),
  showcase: 'b'.repeat(120),
  communityImpact: 'c'.repeat(120),
  staffingPlan: 'd'.repeat(120),
  signText: 'Debian Project',
}

describe('applicationInputSchema', () => {
  it('accepts a complete application', () => {
    const parsed = applicationInputSchema.parse(valid)
    expect(parsed.orgName).toBe('Debian')
  })

  it('normalizes the contact email', () => {
    expect(applicationInputSchema.parse(valid).contactEmail).toBe('maintainer@example.org')
  })

  it('rejects a long-form answer under the minimum', () => {
    const result = applicationInputSchema.safeParse({ ...valid, about: 'too short' })
    expect(result.success).toBe(false)
  })

  it('rejects a long-form answer over the maximum', () => {
    const result = applicationInputSchema.safeParse({ ...valid, about: 'a'.repeat(LIMITS.longTextMax + 1) })
    expect(result.success).toBe(false)
  })

  it('rejects sign text over 60 characters', () => {
    const result = applicationInputSchema.safeParse({ ...valid, signText: 'x'.repeat(61) })
    expect(result.success).toBe(false)
  })

  it('rejects a non-http website scheme', () => {
    const result = applicationInputSchema.safeParse({ ...valid, website: 'javascript:alert(1)' })
    expect(result.success).toBe(false)
  })

  it('accepts a bare domain and adds https', () => {
    expect(applicationInputSchema.parse({ ...valid, website: 'debian.org' }).website)
      .toBe('https://debian.org')
  })

  it('trims whitespace from short fields', () => {
    expect(applicationInputSchema.parse({ ...valid, orgName: '  Debian  ' }).orgName).toBe('Debian')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/validation.test.ts tests/unit/email.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/lib/email.ts`**

```ts
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}
```

- [ ] **Step 4: Write `src/validation/application.ts`**

```ts
import { z } from 'zod'
import { normalizeEmail } from '@/lib/email'

export const LIMITS = {
  longTextMin: 100,
  longTextMax: 2000,
  signTextMax: 60,
  logoBytesMax: 2_097_152,
} as const

const longText = (label: string) =>
  z
    .string()
    .trim()
    .min(LIMITS.longTextMin, `${label} needs at least ${LIMITS.longTextMin} characters`)
    .max(LIMITS.longTextMax, `${label} must be under ${LIMITS.longTextMax} characters`)

const website = z
  .string()
  .trim()
  .min(1, 'Website is required')
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .refine((value) => {
    try {
      const url = new URL(value)
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')
    } catch {
      return false
    }
  }, 'Enter a valid website address')

export const applicationInputSchema = z.object({
  orgName: z.string().trim().min(2, 'Organization name is required').max(120),
  contactName: z.string().trim().min(2, 'Contact name is required').max(120),
  contactEmail: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .transform(normalizeEmail)
    .pipe(z.email('Enter a valid email address')),
  website,
  about: longText('The write-up about your organization'),
  showcase: longText('What you plan to showcase'),
  communityImpact: longText('How this advances advocacy and interests attendees'),
  staffingPlan: longText('Your staffing plan'),
  signText: z
    .string()
    .trim()
    .min(1, 'Sign text is required')
    .max(LIMITS.signTextMax, `Sign text must be ${LIMITS.signTextMax} characters or fewer`),
})

export type ApplicationInput = z.infer<typeof applicationInputSchema>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/validation.test.ts tests/unit/email.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(validation): application input schema with normalized email and website"
```

---

### Task 5: Logo upload validation, sniffing, and SVG sanitization

**Files:**
- Create: `src/services/uploads.ts`
- Test: `tests/unit/uploads.test.ts`

**Interfaces:**
- Consumes: `LIMITS` from `@/validation/application`.
- Produces: from `src/services/uploads.ts`: `type SniffedType = 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'application/pdf'`, `sniffContentType(bytes: Buffer): SniffedType | null`, `sanitizeSvg(svg: string): string`, `type PreparedUpload = { filename: string; contentType: SniffedType; byteSize: number; sha256: string; data: Buffer }`, and `prepareUpload(filename: string, bytes: Buffer): { ok: true; value: PreparedUpload } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

`tests/unit/uploads.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { prepareUpload, sanitizeSvg, sniffContentType } from '@/services/uploads'

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(20)])
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>')

describe('sniffContentType', () => {
  it('detects PNG', () => expect(sniffContentType(png)).toBe('image/png'))
  it('detects JPEG', () => expect(sniffContentType(jpeg)).toBe('image/jpeg'))
  it('detects PDF', () => expect(sniffContentType(pdf)).toBe('application/pdf'))
  it('detects SVG', () => expect(sniffContentType(svg)).toBe('image/svg+xml'))

  it('returns null for an unrecognized type', () => {
    expect(sniffContentType(Buffer.from('MZ\x90\x00 not a logo'))).toBeNull()
  })

  it('is not fooled by a .png filename on a Windows executable', () => {
    expect(sniffContentType(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull()
  })
})

describe('sanitizeSvg', () => {
  it('strips script elements', () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>')
    expect(out).not.toContain('script')
    expect(out).toContain('<rect/>')
  })

  it('strips event handler attributes', () => {
    expect(sanitizeSvg('<svg><rect onload="alert(1)"/></svg>')).not.toContain('onload')
  })

  it('strips external references', () => {
    const out = sanitizeSvg('<svg><image href="https://evil.example/x.png"/></svg>')
    expect(out).not.toContain('evil.example')
  })

  it('strips javascript: URLs', () => {
    expect(sanitizeSvg('<svg><a href="javascript:alert(1)"/></svg>')).not.toContain('javascript:')
  })

  it('leaves benign markup intact', () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h10v10H0z" fill="#1d71f0"/></svg>'
    expect(sanitizeSvg(input)).toContain('fill="#1d71f0"')
  })
})

describe('prepareUpload', () => {
  it('accepts a PNG and hashes it', () => {
    const result = prepareUpload('logo.png', png)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.contentType).toBe('image/png')
      expect(result.value.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(result.value.byteSize).toBe(png.length)
    }
  })

  it('rejects an empty file', () => {
    const result = prepareUpload('logo.png', Buffer.alloc(0))
    expect(result).toEqual({ ok: false, error: 'Choose a logo file.' })
  })

  it('rejects a file over 2 MB', () => {
    const big = Buffer.concat([png, Buffer.alloc(2_097_153)])
    const result = prepareUpload('logo.png', big)
    expect(result.ok).toBe(false)
  })

  it('rejects an unsupported type', () => {
    const result = prepareUpload('logo.exe', Buffer.from([0x4d, 0x5a, 0x90, 0x00]))
    expect(result.ok).toBe(false)
  })

  it('sanitizes SVG content in place', () => {
    const dirty = Buffer.from('<svg><script>alert(1)</script></svg>')
    const result = prepareUpload('logo.svg', dirty)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.data.toString()).not.toContain('script')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/uploads.test.ts`
Expected: FAIL — cannot resolve `@/services/uploads`.

- [ ] **Step 3: Write `src/services/uploads.ts`**

```ts
import { createHash } from 'node:crypto'
import { LIMITS } from '@/validation/application'

export type SniffedType = 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'application/pdf'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])
const PDF_MAGIC = Buffer.from('%PDF-')

export function sniffContentType(bytes: Buffer): SniffedType | null {
  if (bytes.length === 0) return null
  if (bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return 'image/png'
  if (bytes.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) return 'image/jpeg'
  if (bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return 'application/pdf'

  const head = bytes.subarray(0, 1024).toString('utf8').trimStart()
  if (/^(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return 'image/svg+xml'
  }
  return null
}

export function sanitizeSvg(svg: string): string {
  let out = svg
  // Remove entire script and foreignObject subtrees.
  out = out.replace(/<\s*(script|foreignObject)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
  // Remove self-closing or unterminated variants of the same.
  out = out.replace(/<\s*(script|foreignObject)\b[^>]*\/?>/gi, '')
  // Remove on* event handler attributes.
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Remove javascript: and data: URLs in any attribute.
  out = out.replace(/\s(?:xlink:)?href\s*=\s*("|')\s*(?:javascript|data):[^"']*\1/gi, '')
  out = out.replace(/\s(?:xlink:)?href\s*=\s*("|')\s*https?:[^"']*\1/gi, '')
  // Remove url(...) references to remote resources.
  out = out.replace(/url\(\s*['"]?\s*(?:https?|data|javascript):[^)]*\)/gi, 'none')
  // Remove external entity declarations.
  out = out.replace(/<!ENTITY[\s\S]*?>/gi, '')
  return out
}

export interface PreparedUpload {
  filename: string
  contentType: SniffedType
  byteSize: number
  sha256: string
  data: Buffer
}

export type PrepareResult =
  | { ok: true; value: PreparedUpload }
  | { ok: false; error: string }

export function prepareUpload(filename: string, bytes: Buffer): PrepareResult {
  if (bytes.length === 0) return { ok: false, error: 'Choose a logo file.' }
  if (bytes.length > LIMITS.logoBytesMax) {
    return { ok: false, error: 'That file is larger than 2 MB. Please upload a smaller logo.' }
  }

  const contentType = sniffContentType(bytes)
  if (!contentType) {
    return { ok: false, error: 'Logos must be a PNG, JPEG, SVG, or PDF file.' }
  }

  const data =
    contentType === 'image/svg+xml'
      ? Buffer.from(sanitizeSvg(bytes.toString('utf8')), 'utf8')
      : bytes

  const safeName = filename.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'logo'

  return {
    ok: true,
    value: {
      filename: safeName,
      contentType,
      byteSize: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
      data,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/uploads.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(uploads): magic-byte sniffing and SVG sanitization for logos"
```

---

### Task 6: Email senders and template rendering

**Files:**
- Create: `src/services/mail/sender.ts`, `src/services/mail/console.ts`, `src/services/mail/smtp.ts`, `src/services/mail/smtp2go.ts`, `src/services/mail/render.ts`, `src/services/mail/templates.ts`
- Test: `tests/unit/render.test.ts`, `tests/unit/sender.test.ts`

**Interfaces:**
- Consumes: `getEnv()` from `@/env`.
- Produces:
  - `src/services/mail/sender.ts`: `interface OutgoingEmail { to: string; from: string; replyTo?: string; subject: string; text: string; html: string }`, `interface SendResult { providerMessageId?: string }`, `interface EmailSender { send(email: OutgoingEmail): Promise<SendResult> }`, `getSender(): EmailSender`.
  - `src/services/mail/console.ts`: `class ConsoleSender implements EmailSender`, with a static `sent: OutgoingEmail[]` array for tests.
  - `src/services/mail/render.ts`: `renderTemplate(template: { subject: string; body: string }, variables: Record<string, string>): { subject: string; text: string; html: string }`.
  - `src/services/mail/templates.ts`: `DEFAULT_TEMPLATES: Array<{ key: string; name: string; subject: string; body: string; variables: string[] }>`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/render.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { renderTemplate } from '@/services/mail/render'

describe('renderTemplate', () => {
  it('substitutes variables in the subject and body', () => {
    const out = renderTemplate(
      { subject: 'Your booth at {{event}}', body: 'Hello {{org_name}},\n\nWelcome.' },
      { event: 'SCaLE 24x', org_name: 'Debian' },
    )
    expect(out.subject).toBe('Your booth at SCaLE 24x')
    expect(out.text).toContain('Hello Debian,')
  })

  it('leaves an unknown placeholder untouched rather than printing undefined', () => {
    const out = renderTemplate({ subject: 's', body: 'Hi {{nope}}' }, {})
    expect(out.text).toContain('{{nope}}')
  })

  it('escapes HTML in variable values', () => {
    const out = renderTemplate(
      { subject: 's', body: 'Hi {{org_name}}' },
      { org_name: '<script>alert(1)</script>' },
    )
    expect(out.html).not.toContain('<script>')
    expect(out.html).toContain('&lt;script&gt;')
  })

  it('does not escape the variable value in the plain text part', () => {
    const out = renderTemplate({ subject: 's', body: '{{org_name}}' }, { org_name: 'A & B' })
    expect(out.text).toBe('A & B')
  })

  it('does not evaluate expressions', () => {
    const out = renderTemplate({ subject: 's', body: '{{ 1 + 1 }}' }, {})
    expect(out.text).toContain('{{ 1 + 1 }}')
  })

  it('renders blank lines as paragraph breaks in HTML', () => {
    const out = renderTemplate({ subject: 's', body: 'One\n\nTwo' }, {})
    expect(out.html).toContain('<p>One</p>')
    expect(out.html).toContain('<p>Two</p>')
  })
})
```

`tests/unit/sender.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ConsoleSender } from '@/services/mail/console'

describe('ConsoleSender', () => {
  beforeEach(() => {
    ConsoleSender.sent.length = 0
  })

  it('records what it was asked to send', async () => {
    const sender = new ConsoleSender()
    const result = await sender.send({
      to: 'maintainer@example.org',
      from: 'dotorgs@socallinuxexpo.org',
      subject: 'Hello',
      text: 'body',
      html: '<p>body</p>',
    })
    expect(ConsoleSender.sent).toHaveLength(1)
    expect(ConsoleSender.sent[0].to).toBe('maintainer@example.org')
    expect(result.providerMessageId).toMatch(/^console-/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/render.test.ts tests/unit/sender.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/services/mail/render.ts`**

```ts
const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function substitute(
  source: string,
  variables: Record<string, string>,
  transform: (value: string) => string,
): string {
  return source.replace(PLACEHOLDER, (match, name: string) => {
    const value = variables[name.toLowerCase()]
    return value === undefined ? match : transform(value)
  })
}

function toHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

export function renderTemplate(
  template: { subject: string; body: string },
  variables: Record<string, string>,
): RenderedEmail {
  const subject = substitute(template.subject, variables, (value) => value)
  const text = substitute(template.body, variables, (value) => value)
  const html = toHtml(substitute(escapeHtml(template.body), variables, escapeHtml))
  return { subject, text, html }
}
```

Note the ordering in `html`: the template body is escaped first, then variables are substituted with their own escaped values. Escaping after substitution would double-escape any `&` the template itself contains.

- [ ] **Step 4: Write the sender interface and the three implementations**

`src/services/mail/sender.ts`:

```ts
import { getEnv } from '@/env'

export interface OutgoingEmail {
  to: string
  from: string
  replyTo?: string
  subject: string
  text: string
  html: string
}

export interface SendResult {
  providerMessageId?: string
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<SendResult>
}

let cached: EmailSender | undefined

export function getSender(): EmailSender {
  if (cached) return cached
  const env = getEnv()
  switch (env.EMAIL_SENDER) {
    case 'console': {
      const { ConsoleSender } = require('./console') as typeof import('./console')
      cached = new ConsoleSender()
      break
    }
    case 'smtp': {
      const { SmtpSender } = require('./smtp') as typeof import('./smtp')
      cached = new SmtpSender(env.SMTP_HOST!, env.SMTP_PORT ?? 1025)
      break
    }
    case 'smtp2go': {
      const { Smtp2goSender } = require('./smtp2go') as typeof import('./smtp2go')
      cached = new Smtp2goSender(env.SMTP2GO_API_KEY!)
      break
    }
  }
  return cached!
}

export function resetSender(): void {
  cached = undefined
}
```

`src/services/mail/console.ts`:

```ts
import { randomUUID } from 'node:crypto'
import type { EmailSender, OutgoingEmail, SendResult } from './sender'

export class ConsoleSender implements EmailSender {
  static sent: OutgoingEmail[] = []

  async send(email: OutgoingEmail): Promise<SendResult> {
    ConsoleSender.sent.push(email)
    console.log(`\n--- email to ${email.to} ---\n${email.subject}\n\n${email.text}\n---\n`)
    return { providerMessageId: `console-${randomUUID()}` }
  }
}
```

`src/services/mail/smtp.ts`:

```ts
import nodemailer, { type Transporter } from 'nodemailer'
import type { EmailSender, OutgoingEmail, SendResult } from './sender'

export class SmtpSender implements EmailSender {
  private transport: Transporter

  constructor(host: string, port: number) {
    this.transport = nodemailer.createTransport({ host, port, secure: false, ignoreTLS: true })
  }

  async send(email: OutgoingEmail): Promise<SendResult> {
    const info = await this.transport.sendMail({
      to: email.to,
      from: email.from,
      replyTo: email.replyTo,
      subject: email.subject,
      text: email.text,
      html: email.html,
    })
    return { providerMessageId: info.messageId }
  }
}
```

`src/services/mail/smtp2go.ts`:

```ts
import type { EmailSender, OutgoingEmail, SendResult } from './sender'

const ENDPOINT = 'https://api.smtp2go.com/v3/email/send'

export class Smtp2goSender implements EmailSender {
  constructor(private apiKey: string) {}

  async send(email: OutgoingEmail): Promise<SendResult> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': this.apiKey,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: email.from,
        to: [email.to],
        ...(email.replyTo ? { custom_headers: [{ header: 'Reply-To', value: email.replyTo }] } : {}),
        subject: email.subject,
        text_body: email.text,
        html_body: email.html,
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as {
      data?: { succeeded?: number; email_id?: string; failures?: unknown[] }
      error?: string
    }

    if (!response.ok || !payload.data?.succeeded) {
      throw new Error(
        `SMTP2GO rejected the message (HTTP ${response.status}): ${
          payload.error ?? JSON.stringify(payload.data?.failures ?? payload)
        }`,
      )
    }

    return { providerMessageId: payload.data.email_id }
  }
}
```

- [ ] **Step 5: Write `src/services/mail/templates.ts`**

```ts
export interface TemplateDefinition {
  key: string
  name: string
  subject: string
  body: string
  variables: string[]
}

const SIGNOFF = `\n\nThe SCaLE Community Booths team\n{{contact_email}}`

export const DEFAULT_TEMPLATES: TemplateDefinition[] = [
  {
    key: 'submission_receipt',
    name: 'Application received',
    subject: 'We received your {{event}} community booth application',
    body:
      `Hi {{contact_name}},\n\n` +
      `Thanks for applying for a community booth at {{event}} on behalf of {{org_name}}.\n\n` +
      `You can view your application, make changes before the deadline, and see any messages from us here:\n\n` +
      `{{portal_url}}\n\n` +
      `Keep that link — it is how you get back in.\n\n` +
      `We review applications as they come in and will be in touch.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'portal_url', 'contact_email'],
  },
  {
    key: 'magic_link_applicant',
    name: 'Applicant sign-in link',
    subject: 'Your link to your {{event}} booth application',
    body:
      `Hi,\n\n` +
      `Here is your link to your community booth application:\n\n` +
      `{{portal_url}}\n\n` +
      `The link works for 7 days. If you did not ask for it, you can ignore this email.` +
      SIGNOFF,
    variables: ['event', 'portal_url', 'contact_email'],
  },
]
```

The remaining templates (`magic_link_admin`, `info_request`, `waitlisted`, `accepted`, `rejected`, `confirmation_reminder`, `admin_reply_notification`, `admin_invite`) are added in Plan B, where the flows that send them are built.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/render.test.ts tests/unit/sender.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mail): sender interface, console/SMTP/SMTP2GO backends, template rendering"
```

---

### Task 7: Transactional outbox and worker

**Files:**
- Create: `src/services/mail/outbox.ts`
- Test: `tests/integration/outbox.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `emailOutbox`, `getSender()`, `renderTemplate`, `getEnv()`.
- Produces: from `src/services/mail/outbox.ts`: `enqueueEmail(tx: Db, input: { to: string; subject: string; text: string; html: string; messageId?: string }): Promise<string>` returning the outbox row id, and `dispatchPending(limit?: number): Promise<{ sent: number; failed: number }>`, and `BACKOFF_SECONDS: number[]`.

- [ ] **Step 1: Write the failing test**

`tests/integration/outbox.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { emailOutbox } from '@/db/schema'
import { BACKOFF_SECONDS, dispatchPending, enqueueEmail } from '@/services/mail/outbox'
import { ConsoleSender } from '@/services/mail/console'
import * as senderModule from '@/services/mail/sender'

const db = getDb()

beforeEach(async () => {
  await db.delete(emailOutbox)
  ConsoleSender.sent.length = 0
  vi.restoreAllMocks()
})

afterAll(async () => {
  await closeDb()
})

const email = {
  to: 'maintainer@example.org',
  subject: 'Hello',
  text: 'body',
  html: '<p>body</p>',
}

describe('enqueueEmail', () => {
  it('writes a pending row', async () => {
    const id = await enqueueEmail(db, email)
    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) })
    expect(row?.status).toBe('pending')
    expect(row?.attempts).toBe(0)
    expect(row?.fromEmail).toBe('dotorgs@socallinuxexpo.org')
  })

  it('leaves no row when the enclosing transaction rolls back', async () => {
    await expect(
      db.transaction(async (tx) => {
        await enqueueEmail(tx, email)
        throw new Error('rolled back')
      }),
    ).rejects.toThrow('rolled back')

    expect(await db.select().from(emailOutbox)).toHaveLength(0)
  })
})

describe('dispatchPending', () => {
  it('sends a pending row and marks it sent', async () => {
    vi.spyOn(senderModule, 'getSender').mockReturnValue(new ConsoleSender())
    const id = await enqueueEmail(db, email)

    const result = await dispatchPending()
    expect(result).toEqual({ sent: 1, failed: 0 })

    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) })
    expect(row?.status).toBe('sent')
    expect(row?.sentAt).toBeInstanceOf(Date)
    expect(ConsoleSender.sent).toHaveLength(1)
  })

  it('records the error and backs off when the sender throws', async () => {
    vi.spyOn(senderModule, 'getSender').mockReturnValue({
      send: async () => {
        throw new Error('provider down')
      },
    })
    const id = await enqueueEmail(db, email)

    const result = await dispatchPending()
    expect(result).toEqual({ sent: 0, failed: 1 })

    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) })
    expect(row?.status).toBe('pending')
    expect(row?.attempts).toBe(1)
    expect(row?.lastError).toContain('provider down')
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('gives up after the last backoff step', async () => {
    vi.spyOn(senderModule, 'getSender').mockReturnValue({
      send: async () => {
        throw new Error('provider down')
      },
    })
    const id = await enqueueEmail(db, email)
    await db
      .update(emailOutbox)
      .set({ attempts: BACKOFF_SECONDS.length })
      .where(eq(emailOutbox.id, id))

    await dispatchPending()

    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, id) })
    expect(row?.status).toBe('failed')
  })

  it('does not pick up a row whose backoff has not elapsed', async () => {
    vi.spyOn(senderModule, 'getSender').mockReturnValue(new ConsoleSender())
    const id = await enqueueEmail(db, email)
    await db
      .update(emailOutbox)
      .set({ nextAttemptAt: new Date(Date.now() + 60_000) })
      .where(eq(emailOutbox.id, id))

    expect(await dispatchPending()).toEqual({ sent: 0, failed: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/outbox.test.ts`
Expected: FAIL — cannot resolve `@/services/mail/outbox`.

- [ ] **Step 3: Write `src/services/mail/outbox.ts`**

```ts
import { and, eq, lte, sql } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { getDb } from '@/db/client'
import { emailOutbox } from '@/db/schema'
import { getEnv } from '@/env'
import { getSender } from './sender'

/** Delay before each retry. Length also sets the attempt ceiling. */
export const BACKOFF_SECONDS = [60, 300, 900, 3600] as const

export interface EnqueueInput {
  to: string
  subject: string
  text: string
  html: string
  messageId?: string
}

export async function enqueueEmail(tx: Db, input: EnqueueInput): Promise<string> {
  const env = getEnv()
  const [row] = await tx
    .insert(emailOutbox)
    .values({
      toEmail: input.to,
      fromEmail: env.MAIL_FROM,
      replyTo: env.MAIL_FROM,
      subject: input.subject,
      bodyText: input.text,
      bodyHtml: input.html,
      messageId: input.messageId ?? null,
    })
    .returning({ id: emailOutbox.id })
  return row.id
}

export async function dispatchPending(limit = 20): Promise<{ sent: number; failed: number }> {
  const db = getDb()
  const sender = getSender()
  let sent = 0
  let failed = 0

  // Claim rows one at a time with SKIP LOCKED so two workers never send twice.
  for (let i = 0; i < limit; i += 1) {
    const claimed = await db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT id FROM ${emailOutbox}
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `)
      const id = (rows as unknown as Array<{ id: string }>)[0]?.id
      if (!id) return null
      await tx.update(emailOutbox).set({ status: 'sending' }).where(eq(emailOutbox.id, id))
      return id
    })

    if (!claimed) break

    const row = await db.query.emailOutbox.findFirst({ where: eq(emailOutbox.id, claimed) })
    if (!row) continue

    try {
      const result = await sender.send({
        to: row.toEmail,
        from: row.fromEmail,
        replyTo: row.replyTo ?? undefined,
        subject: row.subject,
        text: row.bodyText,
        html: row.bodyHtml,
      })
      await db
        .update(emailOutbox)
        .set({
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: result.providerMessageId ?? null,
          lastError: null,
        })
        .where(eq(emailOutbox.id, row.id))
      sent += 1
    } catch (error) {
      const attempts = row.attempts + 1
      const exhausted = attempts > BACKOFF_SECONDS.length
      const delay = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)]
      await db
        .update(emailOutbox)
        .set({
          status: exhausted ? 'failed' : 'pending',
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          nextAttemptAt: new Date(Date.now() + delay * 1000),
        })
        .where(eq(emailOutbox.id, row.id))
      failed += 1
    }
  }

  return { sent, failed }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/outbox.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mail): transactional outbox with SKIP LOCKED claiming and backoff"
```

---

### Task 8: Branded application shell

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/components/SiteHeader.tsx`, `src/components/SiteFooter.tsx`, `src/components/Button.tsx`
- Test: `tests/e2e/shell.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: `COPY`, `EVENT`.
- Produces: `<SiteHeader />`, `<SiteFooter />`, and `<Button href? onClick? variant='primary'|'secondary'>` from `src/components/`.

- [ ] **Step 1: Write `playwright.config.ts` and the failing test**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/healthz',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

`tests/e2e/shell.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('the shell carries SCaLE branding', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('banner').getByRole('img', { name: /SCaLE/i })).toBeVisible()
  await expect(page.getByRole('contentinfo')).toContainText('socallinuxexpo.org')

  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(bodyFont).toContain('Outfit')

  const headerBg = await page
    .getByRole('banner')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(headerBg).toBe('rgb(34, 34, 34)')
})

test('the primary button uses the SCaLE blue', async ({ page }) => {
  await page.goto('/')
  const button = page.getByRole('link', { name: /apply/i }).first()
  await expect(button).toHaveCSS('background-color', 'rgb(29, 113, 240)')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright install --with-deps chromium && npx playwright test tests/e2e/shell.spec.ts`
Expected: FAIL — no logo, no Outfit, no apply link.

- [ ] **Step 3: Write `src/app/globals.css`**

```css
@import "tailwindcss";

@font-face {
  font-family: "Outfit";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/outfit-latin.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
    U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,
    U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: "Outfit";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("/fonts/outfit-latin-ext.woff2") format("woff2");
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF,
    U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020,
    U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}

@theme {
  --font-sans: "Outfit", ui-sans-serif, system-ui, sans-serif;

  --color-scale-blue: #1d71f0;
  --color-scale-blue-hover: #1a66d8;
  --color-scale-blue-dark: #175ac0;
  --color-scale-blue-light: #4a8df3;
  --color-scale-blue-pale: #a5c6f9;

  --color-scale-gold: #f0b100;
  --color-scale-gold-mid: #f3c133;
  --color-scale-gold-pale: #f9e099;

  --color-scale-ink: #222222;
  --color-scale-muted: #4e4e4e;
  --color-scale-rule: #a7a7a7;
}

body {
  font-family: var(--font-sans);
  color: var(--color-scale-ink);
  background: #ffffff;
}

/* The notched lower edge from the SCaLE theme's hero. */
.hero-notch {
  clip-path: polygon(0 0, 100% 0, 100% 92%, 50% 100%, 0 92%);
}

:focus-visible {
  outline: 3px solid var(--color-scale-blue);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Write the shell components**

`src/components/Button.tsx`:

```tsx
import Link from 'next/link'

type Variant = 'primary' | 'secondary'

const styles: Record<Variant, string> = {
  primary: 'bg-scale-blue text-white hover:bg-scale-blue-hover',
  secondary: 'bg-white text-scale-blue border border-scale-blue hover:bg-scale-blue-pale/30',
}

const base =
  'inline-block rounded px-5 py-3 text-base font-semibold transition-colors disabled:opacity-60'

export function Button({
  href,
  variant = 'primary',
  className = '',
  children,
  ...rest
}: {
  href?: string
  variant?: Variant
  className?: string
  children: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = `${base} ${styles[variant]} ${className}`
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    )
  }
  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  )
}
```

`src/components/SiteHeader.tsx`:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { COPY } from '@/copy'
import { EVENT } from '@/event'

export function SiteHeader() {
  return (
    <header className="bg-scale-ink text-white">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.svg" alt="SCaLE" width={36} height={40} priority />
          <span className="text-lg font-semibold">
            {COPY.programName}
            <span className="ml-2 font-normal text-scale-blue-pale">{EVENT.name}</span>
          </span>
        </Link>
      </div>
    </header>
  )
}
```

`src/components/SiteFooter.tsx`:

```tsx
import { EVENT } from '@/event'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-scale-rule/40 bg-white">
      <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-scale-muted">
        <p>
          {EVENT.name} &middot; {EVENT.dates} &middot; {EVENT.venue}, {EVENT.address}
        </p>
        <p className="mt-2">
          Questions?{' '}
          <a className="text-scale-blue underline" href={`mailto:${EVENT.contactEmail}`}>
            {EVENT.contactEmail}
          </a>{' '}
          &middot;{' '}
          <a className="text-scale-blue underline" href="https://www.socallinuxexpo.org">
            socallinuxexpo.org
          </a>
        </p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 5: Wire the shell into `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { SiteFooter } from '@/components/SiteFooter'
import { SiteHeader } from '@/components/SiteHeader'
import { COPY } from '@/copy'
import { EVENT } from '@/event'
import './globals.css'

export const metadata: Metadata = {
  title: `${COPY.programName} — ${EVENT.name}`,
  description: COPY.tagline,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Give the home page an apply link so the button test has a target**

`src/app/page.tsx`:

```tsx
import { Button } from '@/components/Button'
import { COPY } from '@/copy'

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-4xl font-bold">{COPY.programName}</h1>
      <p className="mt-4 text-lg text-scale-muted">{COPY.tagline}</p>
      <div className="mt-8">
        <Button href="/apply">Apply for a booth</Button>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx playwright test tests/e2e/shell.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(ui): SCaLE-branded shell with Outfit, brand tokens, header and footer"
```

---

### Task 9: Seed script and the public landing page

**Files:**
- Create: `src/db/seed.ts`, `src/lib/settings.ts`
- Modify: `src/app/page.tsx`
- Test: `tests/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `getDb()`, `settings`, `admins`, `emailTemplates`, `DEFAULT_TERMS_TEXT`, `DEFAULT_TEMPLATES`, `windowState`, `formatFee`, `COPY`, `EVENT`.
- Produces: `loadSettings(): Promise<typeof settings.$inferSelect>` from `src/lib/settings.ts`, which throws if the singleton row is missing.

- [ ] **Step 1: Write the failing test**

`tests/e2e/landing.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('the landing page explains the program and the terms', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Community Booths')
  await expect(page.getByText('April 1–4, 2027')).toBeVisible()
  await expect(page.getByText('Pasadena Convention Center')).toBeVisible()

  await expect(page.getByRole('heading', { name: /what scale provides/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /what we ask/i })).toBeVisible()

  await expect(page.getByText('$1,000')).toBeVisible()
  await expect(page.getByText(/late cancellation/i).first()).toBeVisible()

  await expect(page.getByText('Friday, April 2')).toBeVisible()
  await expect(page.getByText('1:00 pm')).toBeVisible()
  await expect(page.getByText('TBD').first()).toBeVisible()

  await expect(page.getByRole('link', { name: /apply for a booth/i })).toBeVisible()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/landing.spec.ts`
Expected: FAIL — the landing page has none of this content yet.

- [ ] **Step 3: Write `src/db/seed.ts`**

```ts
import { closeDb, getDb } from './client'
import { admins, emailTemplates, settings } from './schema'
import { DEFAULT_TERMS_TEXT } from '@/domain/settings'
import { DEFAULT_TEMPLATES } from '@/services/mail/templates'

async function main() {
  const db = getDb()

  await db
    .insert(admins)
    .values({ email: 'bala@socallinuxexpo.org', name: 'Bala', isActive: true })
    .onConflictDoNothing({ target: admins.email })

  await db
    .insert(settings)
    .values({
      id: 1,
      applicationsOpenAt: new Date('2026-10-01T00:00:00Z'),
      applicationsCloseAt: new Date('2027-01-15T23:59:59Z'),
      boothCap: 40,
      lateCancellationFeeCents: 100_000,
      termsText: DEFAULT_TERMS_TEXT,
      termsVersion: 1,
    })
    .onConflictDoNothing({ target: settings.id })

  for (const template of DEFAULT_TEMPLATES) {
    await db.insert(emailTemplates).values(template).onConflictDoNothing({ target: emailTemplates.key })
  }

  await closeDb()
  console.log('seeded: admin bala@socallinuxexpo.org, settings, templates')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 4: Write `src/lib/settings.ts`**

```ts
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { settings } from '@/db/schema'

export type Settings = typeof settings.$inferSelect

export async function loadSettings(): Promise<Settings> {
  const row = await getDb().query.settings.findFirst({ where: eq(settings.id, 1) })
  if (!row) {
    throw new Error('Settings row is missing. Run `npm run db:seed`.')
  }
  return row
}
```

- [ ] **Step 5: Write the landing page**

`src/app/page.tsx`:

```tsx
import { Button } from '@/components/Button'
import { COPY } from '@/copy'
import { EVENT } from '@/event'
import { formatFee, windowState } from '@/domain/settings'
import { loadSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const settings = await loadSettings()
  const state = windowState(settings, new Date())
  const closes = settings.applicationsCloseAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  })

  return (
    <main>
      <section className="hero-notch bg-scale-ink pb-20 text-white">
        <div className="mx-auto max-w-5xl px-6 pt-14">
          <h1 className="text-5xl font-bold tracking-tight">{COPY.programName}</h1>
          <p className="mt-4 max-w-2xl text-xl text-scale-blue-pale">{COPY.tagline}</p>
          <p className="mt-6 text-lg">
            {EVENT.dates} &middot; {EVENT.venue}, {EVENT.address}
          </p>
          <div className="mt-8">
            {state === 'open' ? (
              <Button href="/apply">Apply for a booth</Button>
            ) : (
              <p className="rounded bg-white/10 px-5 py-3 text-base">
                {state === 'before'
                  ? 'Applications are not open yet. Check back soon.'
                  : `Applications closed on ${closes}.`}
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6">
        <section className="mt-12 max-w-3xl space-y-4 text-lg leading-relaxed text-scale-muted">
          {COPY.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <div className="mt-12 grid gap-10 md:grid-cols-2">
          <section>
            <h2 className="text-2xl font-bold">What SCaLE provides</h2>
            <ul className="mt-4 space-y-2 text-scale-muted">
              {COPY.provides.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="text-scale-gold">
                    &#9670;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold">What we ask in return</h2>
            <ul className="mt-4 space-y-2 text-scale-muted">
              {COPY.expects.map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="text-scale-gold">
                    &#9670;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-12">
          <h2 className="text-2xl font-bold">Expo floor hours</h2>
          <table className="mt-4 w-full max-w-lg border-collapse text-left">
            <thead>
              <tr className="border-b border-scale-rule/50 text-sm uppercase tracking-wide text-scale-muted">
                <th className="py-2 pr-4 font-semibold">Day</th>
                <th className="py-2 pr-4 font-semibold">Opens</th>
                <th className="py-2 font-semibold">Closes</th>
              </tr>
            </thead>
            <tbody>
              {EVENT.expoHours.map((slot) => (
                <tr key={slot.day} className="border-b border-scale-rule/20">
                  <td className="py-2 pr-4">{slot.day}</td>
                  <td className="py-2 pr-4">{slot.opens}</td>
                  <td className="py-2">{slot.closes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm text-scale-muted">
            Your booth needs someone at it for all of these hours.
          </p>
        </section>

        <section className="mt-12 rounded border-l-4 border-scale-gold bg-scale-gold-pale/25 p-6">
          <h2 className="text-2xl font-bold">The booth is free. Cancelling late is not.</h2>
          <p className="mt-3 text-scale-muted">
            Booth space is limited, and every booth we hold is one another project cannot have. If
            you cancel fewer than 30 days before the event, or do not occupy your booth during the
            show, a late cancellation fee of{' '}
            <strong className="text-scale-ink">
              {formatFee(settings.lateCancellationFeeCents)}
            </strong>{' '}
            applies. You will see the full terms and agree to them after we accept your application.
          </p>
        </section>

        {state === 'open' && (
          <section className="mt-12 mb-4">
            <p className="text-scale-muted">Applications close on {closes}.</p>
            <div className="mt-4">
              <Button href="/apply">Apply for a booth</Button>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 6: Seed and run the test**

Run: `npm run db:migrate && npm run db:seed && npx playwright test tests/e2e/landing.spec.ts`
Expected: PASS, 1 test.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(public): seeded settings and the community booths landing page"
```

---

### Task 10: The application form

**Files:**
- Create: `src/app/apply/page.tsx`, `src/app/apply/ApplyForm.tsx`, `src/app/apply/actions.ts`, `src/app/apply/submitted/page.tsx`, `src/components/Field.tsx`, `src/lib/ratelimit.ts`, `src/services/applications.ts`
- Test: `tests/unit/ratelimit.test.ts`, `tests/integration/submit.test.ts`, `tests/e2e/apply.spec.ts`

**Interfaces:**
- Consumes: `applicationInputSchema`, `prepareUpload`, `enqueueEmail`, `renderTemplate`, `loadSettings`, `windowState`, `getDb()`.
- Produces:
  - `src/lib/ratelimit.ts`: `hit(key: string, limit: number, windowMs: number): boolean` (true = allowed), `resetRateLimits(): void`.
  - `src/services/applications.ts`: `createApplication(input: ApplicationInput, logo: PreparedUpload): Promise<{ id: string; token: string }>`.
  - `src/app/apply/actions.ts`: `submitApplication(prev: FormState, formData: FormData): Promise<FormState>` where `type FormState = { errors: Record<string, string>; message?: string }`.

- [ ] **Step 1: Write the failing unit test for rate limiting**

`tests/unit/ratelimit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hit, resetRateLimits } from '@/lib/ratelimit'

beforeEach(() => {
  resetRateLimits()
  vi.useRealTimers()
})

describe('hit', () => {
  it('allows up to the limit', () => {
    expect(hit('ip:1', 3, 60_000)).toBe(true)
    expect(hit('ip:1', 3, 60_000)).toBe(true)
    expect(hit('ip:1', 3, 60_000)).toBe(true)
  })

  it('blocks past the limit', () => {
    for (let i = 0; i < 3; i += 1) hit('ip:2', 3, 60_000)
    expect(hit('ip:2', 3, 60_000)).toBe(false)
  })

  it('keeps separate counters per key', () => {
    for (let i = 0; i < 3; i += 1) hit('ip:3', 3, 60_000)
    expect(hit('ip:4', 3, 60_000)).toBe(true)
  })

  it('lets the window expire', () => {
    vi.useFakeTimers()
    for (let i = 0; i < 3; i += 1) hit('ip:5', 3, 60_000)
    expect(hit('ip:5', 3, 60_000)).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(hit('ip:5', 3, 60_000)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/ratelimit.test.ts`
Expected: FAIL — cannot resolve `@/lib/ratelimit`.

- [ ] **Step 3: Write `src/lib/ratelimit.ts`**

```ts
interface Window {
  count: number
  expiresAt: number
}

const windows = new Map<string, Window>()

/**
 * In-process fixed-window counter. Counters reset on restart and are not shared
 * across containers; see the spec's rate-limit note for why that is acceptable here.
 */
export function hit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const existing = windows.get(key)

  if (!existing || existing.expiresAt <= now) {
    windows.set(key, { count: 1, expiresAt: now + windowMs })
    return true
  }

  if (existing.count >= limit) return false

  existing.count += 1
  return true
}

export function resetRateLimits(): void {
  windows.clear()
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/unit/ratelimit.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing integration test for submission**

`tests/integration/submit.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { applications, authTokens, emailOutbox, uploads } from '@/db/schema'
import { createApplication } from '@/services/applications'
import { prepareUpload } from '@/services/uploads'

const db = getDb()

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

const input = {
  orgName: 'Debian',
  contactName: 'A Maintainer',
  contactEmail: 'maintainer@example.org',
  website: 'https://www.debian.org',
  about: 'a'.repeat(120),
  showcase: 'b'.repeat(120),
  communityImpact: 'c'.repeat(120),
  staffingPlan: 'd'.repeat(120),
  signText: 'Debian Project',
}

beforeEach(async () => {
  await db.delete(emailOutbox)
  await db.delete(applications)
})

afterAll(async () => {
  await closeDb()
})

function logo() {
  const result = prepareUpload('logo.png', png)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

describe('createApplication', () => {
  it('stores the application, the logo, a token, and a receipt email', async () => {
    const { id, token } = await createApplication(input, logo())

    const app = await db.query.applications.findFirst({ where: eq(applications.id, id) })
    expect(app?.status).toBe('submitted')
    expect(app?.logoUploadId).not.toBeNull()

    const upload = await db.query.uploads.findFirst({ where: eq(uploads.applicationId, id) })
    expect(upload?.contentType).toBe('image/png')

    const tokens = await db.select().from(authTokens).where(eq(authTokens.applicationId, id))
    expect(tokens).toHaveLength(1)
    expect(tokens[0].purpose).toBe('applicant_portal')
    expect(tokens[0].tokenHash).not.toBe(token)
    expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)

    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].toEmail).toBe('maintainer@example.org')
    expect(outbox[0].bodyText).toContain(token)
    expect(outbox[0].status).toBe('pending')
  })

  it('writes nothing at all if the email cannot be queued', async () => {
    const bad = { ...input, contactEmail: 'x'.repeat(10_000) + '@example.org' }
    await expect(createApplication(bad, logo())).rejects.toThrow()
    expect(await db.select().from(applications)).toHaveLength(0)
    expect(await db.select().from(uploads)).toHaveLength(0)
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/integration/submit.test.ts`
Expected: FAIL — cannot resolve `@/services/applications`.

- [ ] **Step 7: Write `src/services/applications.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications, authTokens, emailTemplates, uploads } from '@/db/schema'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'
import type { PreparedUpload } from '@/services/uploads'
import type { ApplicationInput } from '@/validation/application'

export const APPLICANT_TOKEN_DAYS = 7

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function createApplication(
  input: ApplicationInput,
  logo: PreparedUpload,
): Promise<{ id: string; token: string }> {
  const db = getDb()
  const env = getEnv()
  const token = newToken()

  return db.transaction(async (tx) => {
    const [application] = await tx.insert(applications).values(input).returning()

    const [upload] = await tx
      .insert(uploads)
      .values({ ...logo, applicationId: application.id })
      .returning({ id: uploads.id })

    await tx
      .update(applications)
      .set({ logoUploadId: upload.id })
      .where(eq(applications.id, application.id))

    const expiresAt = new Date(Date.now() + APPLICANT_TOKEN_DAYS * 86_400_000)
    await tx.insert(authTokens).values({
      tokenHash: hashToken(token),
      purpose: 'applicant_portal',
      applicationId: application.id,
      expiresAt,
    })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'submission_receipt'),
    })
    if (!template) throw new Error('Missing email template: submission_receipt')

    const rendered = renderTemplate(template, {
      contact_name: application.contactName,
      org_name: application.orgName,
      event: EVENT.name,
      contact_email: EVENT.contactEmail,
      portal_url: `${env.PUBLIC_BASE_URL}/portal/enter?token=${token}`,
    })

    await enqueueEmail(tx, {
      to: application.contactEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })

    return { id: application.id, token }
  })
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run db:seed && npx vitest run tests/integration/submit.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 9: Write the field component and the form**

`src/components/Field.tsx`:

```tsx
export function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string
  name: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  const hintId = hint ? `${name}-hint` : undefined
  const errorId = error ? `${name}-error` : undefined
  return (
    <div className="mb-6">
      <label htmlFor={name} className="block text-base font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-scale-muted">
          {hint}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {error && (
        <p id={errorId} className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}

export const inputClass =
  'w-full rounded border border-scale-rule px-3 py-2 text-base focus:border-scale-blue focus:outline-none'
```

`src/app/apply/actions.ts`:

```ts
'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { hit } from '@/lib/ratelimit'
import { loadSettings } from '@/lib/settings'
import { windowState } from '@/domain/settings'
import { createApplication } from '@/services/applications'
import { prepareUpload } from '@/services/uploads'
import { applicationInputSchema } from '@/validation/application'

export interface FormState {
  errors: Record<string, string>
  message?: string
}

export async function submitApplication(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const settings = await loadSettings()
  if (windowState(settings, new Date()) !== 'open') {
    return { errors: {}, message: 'Applications are not open.' }
  }

  const forwarded = (await headers()).get('x-forwarded-for') ?? 'unknown'
  const ip = forwarded.split(',')[0]!.trim()
  if (!hit(`submit:${ip}`, 5, 3_600_000)) {
    return { errors: {}, message: 'Too many submissions from this address. Try again later.' }
  }

  const parsed = applicationInputSchema.safeParse(Object.fromEntries(formData))
  const errors: Record<string, string> = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0])
      errors[key] ??= issue.message
    }
  }

  const file = formData.get('logo')
  let logo = null
  if (!(file instanceof File) || file.size === 0) {
    errors.logo = 'Choose a logo file.'
  } else {
    const prepared = prepareUpload(file.name, Buffer.from(await file.arrayBuffer()))
    if (!prepared.ok) errors.logo = prepared.error
    else logo = prepared.value
  }

  if (Object.keys(errors).length > 0 || !logo || !parsed.success) {
    return { errors, message: 'Please fix the problems below.' }
  }

  await createApplication(parsed.data, logo)
  redirect('/apply/submitted')
}
```

`src/app/apply/ApplyForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { LIMITS } from '@/validation/application'
import { submitApplication, type FormState } from './actions'

const initial: FormState = { errors: {} }

const LONG_FIELDS = [
  {
    name: 'about',
    label: 'Tell us about your organization',
    hint: 'Who you are and what you work on.',
  },
  {
    name: 'showcase',
    label: 'What will you showcase at your booth?',
    hint: 'Roughly what attendees will see, try, or talk to you about.',
  },
  {
    name: 'communityImpact',
    label: 'How does this advance advocacy and interest attendees?',
    hint: 'What our attendees get out of it, and what it does for your community.',
  },
  {
    name: 'staffingPlan',
    label: 'How will you keep someone at the booth at all times?',
    hint: 'We need at least one person at your booth for every hour the expo floor is open.',
  },
] as const

export function ApplyForm() {
  const [state, action, pending] = useActionState(submitApplication, initial)
  const errorCount = Object.keys(state.errors).length

  return (
    <form action={action} noValidate encType="multipart/form-data">
      {state.message && (
        <div
          role="alert"
          tabIndex={-1}
          className="mb-8 rounded border-l-4 border-red-700 bg-red-50 p-4"
        >
          <p className="font-semibold text-red-800">{state.message}</p>
          {errorCount > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
              {Object.entries(state.errors).map(([field, message]) => (
                <li key={field}>
                  <a className="underline" href={`#${field}`}>
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Field label="Organization name" name="orgName" error={state.errors.orgName}>
        <input id="orgName" name="orgName" required className={inputClass} />
      </Field>

      <Field label="Contact name" name="contactName" error={state.errors.contactName}>
        <input id="contactName" name="contactName" required className={inputClass} />
      </Field>

      <Field
        label="Contact email"
        name="contactEmail"
        hint="We send everything about your application here."
        error={state.errors.contactEmail}
      >
        <input id="contactEmail" name="contactEmail" type="email" required className={inputClass} />
      </Field>

      <Field label="Website" name="website" error={state.errors.website}>
        <input id="website" name="website" required className={inputClass} placeholder="example.org" />
      </Field>

      {LONG_FIELDS.map((field) => (
        <Field
          key={field.name}
          label={field.label}
          name={field.name}
          hint={`${field.hint} Between ${LIMITS.longTextMin} and ${LIMITS.longTextMax} characters.`}
          error={state.errors[field.name]}
        >
          <textarea id={field.name} name={field.name} rows={6} required className={inputClass} />
        </Field>
      ))}

      <Field
        label="Booth sign text"
        name="signText"
        hint={`What the printed sign above your booth should say. ${LIMITS.signTextMax} characters or fewer.`}
        error={state.errors.signText}
      >
        <input
          id="signText"
          name="signText"
          maxLength={LIMITS.signTextMax}
          required
          className={inputClass}
        />
      </Field>

      <Field
        label="Logo"
        name="logo"
        hint="PNG, JPEG, SVG, or PDF, up to 2 MB. Vector or a large raster file prints best."
        error={state.errors.logo}
      >
        <input
          id="logo"
          name="logo"
          type="file"
          accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf"
          required
          className="block w-full text-base"
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit application'}
      </Button>
    </form>
  )
}
```

`src/app/apply/page.tsx`:

```tsx
import { ApplyForm } from './ApplyForm'
import { COPY } from '@/copy'
import { EVENT } from '@/event'
import { formatFee, windowState } from '@/domain/settings'
import { loadSettings } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export default async function Apply() {
  const settings = await loadSettings()
  const state = windowState(settings, new Date())

  if (state !== 'open') {
    const closes = settings.applicationsCloseAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    })
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold">Applications are {state === 'before' ? 'not open yet' : 'closed'}</h1>
        <p className="mt-4 text-scale-muted">
          {state === 'before'
            ? `Applications for ${COPY.programName} at ${EVENT.name} have not opened yet. Check back soon.`
            : `Applications closed on ${closes}. Write to ${EVENT.contactEmail} if you think you should still be able to apply.`}
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-bold">Apply for a community booth</h1>
      <p className="mt-4 text-lg text-scale-muted">
        {EVENT.name} &middot; {EVENT.dates} &middot; {EVENT.venue}
      </p>
      <p className="mt-6 rounded border-l-4 border-scale-gold bg-scale-gold-pale/25 p-4 text-scale-muted">
        The booth is free. If we accept you and you cancel fewer than 30 days before the event, or
        do not occupy your booth, a late cancellation fee of{' '}
        <strong className="text-scale-ink">{formatFee(settings.lateCancellationFeeCents)}</strong>{' '}
        applies. You will see the full terms and agree to them after we accept you.
      </p>
      <div className="mt-10">
        <ApplyForm />
      </div>
    </main>
  )
}
```

`src/app/apply/submitted/page.tsx`:

```tsx
import { EVENT } from '@/event'

export default function Submitted() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold">Application received</h1>
      <p className="mt-4 text-lg text-scale-muted">
        Thanks. We have sent a confirmation to the address you gave us, with a link back to your
        application. Use that link to make changes before the deadline or to see messages from us.
      </p>
      <p className="mt-4 text-scale-muted">
        Nothing in your inbox after a few minutes? Check your spam folder, then write to{' '}
        <a className="text-scale-blue underline" href={`mailto:${EVENT.contactEmail}`}>
          {EVENT.contactEmail}
        </a>
        .
      </p>
    </main>
  )
}
```

- [ ] **Step 10: Write the end-to-end test**

`tests/e2e/apply.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
)

const LONG = 'We are a long-running free software project with an active community. '.repeat(3)

test('an organization can apply and is told to check their email', async ({ page }) => {
  await page.goto('/apply')

  await page.getByLabel('Organization name').fill('Debian')
  await page.getByLabel('Contact name').fill('A Maintainer')
  await page.getByLabel('Contact email').fill(`maintainer+${Date.now()}@example.org`)
  await page.getByLabel('Website').fill('debian.org')
  await page.getByLabel('Tell us about your organization').fill(LONG)
  await page.getByLabel('What will you showcase at your booth?').fill(LONG)
  await page.getByLabel('How does this advance advocacy and interest attendees?').fill(LONG)
  await page.getByLabel('How will you keep someone at the booth at all times?').fill(LONG)
  await page.getByLabel('Booth sign text').fill('The Debian Project')
  await page.getByLabel('Logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  })

  await page.getByRole('button', { name: /submit application/i }).click()

  await expect(page.getByRole('heading', { name: /application received/i })).toBeVisible()
})

test('a short answer is rejected with an error summary', async ({ page }) => {
  await page.goto('/apply')

  await page.getByLabel('Organization name').fill('Debian')
  await page.getByLabel('Contact name').fill('A Maintainer')
  await page.getByLabel('Contact email').fill('maintainer@example.org')
  await page.getByLabel('Website').fill('debian.org')
  await page.getByLabel('Tell us about your organization').fill('too short')
  await page.getByLabel('What will you showcase at your booth?').fill(LONG)
  await page.getByLabel('How does this advance advocacy and interest attendees?').fill(LONG)
  await page.getByLabel('How will you keep someone at the booth at all times?').fill(LONG)
  await page.getByLabel('Booth sign text').fill('The Debian Project')
  await page.getByLabel('Logo').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PNG,
  })

  await page.getByRole('button', { name: /submit application/i }).click()

  await expect(page.getByRole('alert')).toContainText('Please fix the problems below.')
  await expect(page.getByRole('alert')).toContainText('at least 100 characters')
})
```

- [ ] **Step 11: Run every test**

Run: `npm run db:migrate && npm run db:seed && npx vitest run && npx playwright test`
Expected: all Vitest suites PASS; all Playwright specs PASS.

- [ ] **Step 12: Verify the receipt email arrives in Mailpit**

Run: `npx tsx -e "import('./src/services/mail/outbox').then(m => m.dispatchPending()).then(console.log)"`
Expected: `{ sent: N, failed: 0 }` where N is at least 1.
Open `http://localhost:8025` and confirm a "We received your SCaLE 24x community booth application" email is there, containing a `/portal/enter?token=` link.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(public): application form, submission service, and receipt email"
```

---

## Self-review notes

Checked against the spec:

- **Covered by this plan:** validated env and boot-time refusal without an API key (Task 1); every table in the spec's data model (Task 2); the window rules, terms text, and fee formatting (Task 3); all field constraints including the 60-char sign text and 100–2000 long text (Task 4); the 2 MB cap, magic-byte sniffing, and SVG sanitization (Task 5); the `EmailSender` interface with three backends and non-evaluating template rendering (Task 6); the transactional outbox with backoff (Task 7); the brand tokens, self-hosted Outfit, and the notched hero (Task 8); seeded admin, settings, and templates, and the public program page (Task 9); the application form, rate limiting, receipt email, and the hashed applicant token (Task 10).
- **Deliberately deferred to Plan B:** magic-link redemption and sessions, the applicant portal, the admin console, the status machine, decisions and correspondence, confirm-booth. Task 10 issues an applicant token and mails a `/portal/enter?token=` link; that route is built in Plan B, so following the link before then 404s. This is the only known dangling reference and it is intentional.
- **Deferred to Plan C:** templates/settings/admin-management UIs, CSV and logo-ZIP exports, the production Dockerfile and Caddyfile.
- **Naming checked across tasks:** `getDb`/`closeDb`, `Db`, `getEnv`/`parseEnv`, `prepareUpload`/`PreparedUpload`, `enqueueEmail`/`dispatchPending`, `renderTemplate`, `windowState`/`formatFee`, `loadSettings`, `hashToken`/`newToken`, `hit`/`resetRateLimits`, `applicationInputSchema`/`LIMITS` are each defined once and used with matching signatures.
- **Open items unchanged from the spec:** Saturday and Sunday expo-floor opening times render as `TBD` from `EVENT.expoHours`; program name, deadline, and terms wording are seeded with defaults and editable.
