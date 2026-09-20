# Plan B — Applicant Portal and Admin Review

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop — an applicant signs in by magic link to watch, edit, discuss and confirm their booth, and an admin signs in to review applications, decide them, and correspond, with every email queued in the same transaction as the decision that caused it.

**Architecture:** Two cookie-scoped session kinds over the `auth_tokens` and `sessions` tables already in the schema. All status changes funnel through one guarded function in `src/domain/application.ts`, which writes the audit row and queues the templated email inside the caller's transaction. Route groups `(portal)` and `(admin)` sit alongside the existing public routes in the same Next app.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Tailwind v4, Drizzle ORM, postgres.js, Zod 4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-scale-dotorg-booths-design.md`

**Builds on:** `docs/superpowers/plans/2026-09-19-plan-a-foundation-and-public-application.md` (merged to `main`)

## Global Constraints

- Event is SCaLE 24x, April 1–4 2027, Pasadena Convention Center, 300 E Green St, Pasadena CA 91101.
- Program is named **Community Booths**; all user-facing copy lives in `src/copy.ts`.
- Outbound mail is from `dotorgs@socallinuxexpo.org`, Reply-To the same.
- Late cancellation fee is read from `settings.lateCancellationFeeCents`, never hardcoded.
- Brand tokens: primary `#1d71f0`, hover `#1a66d8`, dark `#175ac0`, light `#4a8df3`, pale `#a5c6f9`, accent `#f0b100`, accent-mid `#f3c133`, accent-pale `#f9e099`, ink `#222`, muted `#4e4e4e`, rules `#a7a7a7`, on white. Tailwind classes are `scale-blue`, `scale-gold`, `scale-ink`, `scale-muted`, `scale-rule` and their variants, already defined in `src/app/globals.css`.
- Emails are stored lowercased; compare only via `normalizeEmail`.
- Auth tokens are stored as SHA-256 hashes. A raw token exists only in an email.
- Admin login tokens live 30 minutes; applicant portal tokens live 7 days. Both single-use.
- Admin sessions last 7 days, applicant sessions 30 days, both sliding.
- Every "we sent you a link" response is byte-identical whether or not the address exists.
- Internal notes live in `internal_notes` and must never be selected by a `(portal)` route.
- Every status change writes an `audit_log` row in the same transaction.
- Existing helpers to reuse, not reinvent: `getDb()`, `type Db`, `loadSettings()`, `formatFee()`, `windowState()`, `enqueueEmail(tx, input)`, `renderTemplate(template, vars)`, `normalizeEmail()`, `hit(key, limit, windowMs)`, `<Button>`, `<Field>`, `inputClass`.

## File Structure

```
src/
  domain/
    application.ts        NEW  status machine, transitionApplication()
  services/
    auth/
      tokens.ts           NEW  newToken/hashToken (moved), issueToken, consumeToken
      session.ts          NEW  cookie sessions, requireAdmin, requireApplicant
    applications.ts       MOD  import token helpers from auth/tokens
    mail/templates.ts     MOD  six more templates
  components/
    StatusBadge.tsx       NEW  one status pill, used by portal and admin
    Prose.tsx             NEW  renders a stored multi-line answer safely
  app/
    logo/[id]/route.ts    NEW  access-checked logo bytes
    portal/
      page.tsx            NEW  request a link
      actions.ts          NEW  requestPortalLink
      enter/route.ts      NEW  consume token, set cookie, redirect
      application/
        page.tsx          NEW  status, answers, thread, confirm panel
        EditForm.tsx      NEW  client form
        ReplyForm.tsx     NEW  client form
        ConfirmPanel.tsx  NEW  client form
        actions.ts        NEW  saveApplication, withdraw, reply, confirmBooth
    admin/
      login/page.tsx      NEW  request an admin link
      login/actions.ts    NEW  requestAdminLink
      enter/route.ts      NEW  consume token, set cookie, redirect
      layout.tsx          NEW  admin chrome + auth gate
      page.tsx            NEW  dashboard counts
      applications/
        page.tsx          NEW  filterable list
        [id]/page.tsx     NEW  detail
        [id]/DecisionPanel.tsx   NEW
        [id]/NoteForm.tsx        NEW
        [id]/ComposeForm.tsx     NEW
        [id]/actions.ts          NEW  decide, addNote, sendMessage, assignBooth
```

## Deviations from the spec, recorded up front

- **Two cookie names, not one.** `booth_admin` and `booth_applicant`. The spec implies a single session; separate cookies let an admin open an applicant's portal link in the same browser without being logged out of the admin console, which is exactly what happens while testing and during the demo.
- **`under_review → submitted` is permitted.** The spec says the four open states are mutually reachable. Kept as written: it gives an admin an undo after a misclick.

---

### Task 1: Status machine

**Files:**
- Create: `src/domain/application.ts`
- Test: `tests/unit/status.test.ts`

**Interfaces:**
- Consumes: `applicationStatus` from `@/db/schema`.
- Produces: `type Status = 'submitted' | 'under_review' | 'info_requested' | 'waitlisted' | 'accepted' | 'confirmed' | 'rejected' | 'withdrawn'`; `TRANSITIONS: Record<Status, readonly Status[]>`; `canTransition(from: Status, to: Status): boolean`; `assertTransition(from: Status, to: Status): void` (throws `Error`); `OPEN_STATUSES: readonly Status[]`; `TERMINAL_STATUSES: readonly Status[]`; `isEditable(status: Status): boolean`; `STATUS_LABELS: Record<Status, string>`; `DECISION_TEMPLATE_KEYS: Partial<Record<Status, string>>`.

- [ ] **Step 1: Write the failing test**

`tests/unit/status.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DECISION_TEMPLATE_KEYS,
  STATUS_LABELS,
  TRANSITIONS,
  assertTransition,
  canTransition,
  isEditable,
  type Status,
} from '@/domain/application'

const ALL: Status[] = [
  'submitted',
  'under_review',
  'info_requested',
  'waitlisted',
  'accepted',
  'confirmed',
  'rejected',
  'withdrawn',
]

describe('TRANSITIONS', () => {
  it('covers every status', () => {
    for (const status of ALL) expect(TRANSITIONS[status]).toBeDefined()
  })

  it('only ever targets a real status', () => {
    for (const targets of Object.values(TRANSITIONS)) {
      for (const target of targets) expect(ALL).toContain(target)
    }
  })

  it('never lets a status transition to itself', () => {
    for (const status of ALL) expect(TRANSITIONS[status]).not.toContain(status)
  })
})

describe('canTransition', () => {
  it('lets an admin accept straight from submitted without passing through review', () => {
    expect(canTransition('submitted', 'accepted')).toBe(true)
  })

  it('lets the four open states reach each other', () => {
    const open: Status[] = ['submitted', 'under_review', 'info_requested', 'waitlisted']
    for (const from of open) {
      for (const to of open) {
        if (from !== to) expect(canTransition(from, to)).toBe(true)
      }
    }
  })

  it('allows accepted to be confirmed', () => {
    expect(canTransition('accepted', 'confirmed')).toBe(true)
  })

  it('does not allow confirmed to go back to accepted', () => {
    expect(canTransition('confirmed', 'accepted')).toBe(false)
  })

  it('does not allow an accepted application to return to review', () => {
    expect(canTransition('accepted', 'under_review')).toBe(false)
  })

  it('treats rejected as terminal', () => {
    expect(TRANSITIONS.rejected).toHaveLength(0)
  })

  it('treats withdrawn as terminal', () => {
    expect(TRANSITIONS.withdrawn).toHaveLength(0)
  })

  it('lets every pre-confirmed state be withdrawn', () => {
    for (const status of ['submitted', 'under_review', 'info_requested', 'waitlisted', 'accepted'] as Status[]) {
      expect(canTransition(status, 'withdrawn')).toBe(true)
    }
  })

  it('lets a confirmed booth be withdrawn', () => {
    expect(canTransition('confirmed', 'withdrawn')).toBe(true)
  })
})

describe('assertTransition', () => {
  it('passes a legal move', () => {
    expect(() => assertTransition('submitted', 'accepted')).not.toThrow()
  })

  it('names both states when refusing', () => {
    expect(() => assertTransition('rejected', 'accepted')).toThrow(/rejected.*accepted/)
  })
})

describe('isEditable', () => {
  it('allows editing while the application is still open', () => {
    expect(isEditable('submitted')).toBe(true)
    expect(isEditable('under_review')).toBe(true)
    expect(isEditable('info_requested')).toBe(true)
  })

  it('refuses editing once a decision is made', () => {
    expect(isEditable('accepted')).toBe(false)
    expect(isEditable('waitlisted')).toBe(false)
    expect(isEditable('rejected')).toBe(false)
    expect(isEditable('withdrawn')).toBe(false)
  })
})

describe('labels and templates', () => {
  it('labels every status for display', () => {
    for (const status of ALL) expect(STATUS_LABELS[status]).toBeTruthy()
  })

  it('maps the four notifying decisions to templates', () => {
    expect(DECISION_TEMPLATE_KEYS.accepted).toBe('accepted')
    expect(DECISION_TEMPLATE_KEYS.rejected).toBe('rejected')
    expect(DECISION_TEMPLATE_KEYS.waitlisted).toBe('waitlisted')
    expect(DECISION_TEMPLATE_KEYS.info_requested).toBe('info_request')
  })

  it('has no template for internal-only moves', () => {
    expect(DECISION_TEMPLATE_KEYS.under_review).toBeUndefined()
    expect(DECISION_TEMPLATE_KEYS.confirmed).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/status.test.ts`
Expected: FAIL — cannot resolve `@/domain/application`.

- [ ] **Step 3: Write `src/domain/application.ts`**

```ts
import { applicationStatus } from '@/db/schema'

export type Status = (typeof applicationStatus.enumValues)[number]

/** The states an application can still be moved freely between. */
export const OPEN_STATUSES = ['submitted', 'under_review', 'info_requested', 'waitlisted'] as const

export const TERMINAL_STATUSES = ['rejected', 'withdrawn'] as const

const openTargets = (self: Status): Status[] =>
  OPEN_STATUSES.filter((s) => s !== self) as Status[]

export const TRANSITIONS: Record<Status, readonly Status[]> = {
  submitted: [...openTargets('submitted'), 'accepted', 'rejected', 'withdrawn'],
  under_review: [...openTargets('under_review'), 'accepted', 'rejected', 'withdrawn'],
  info_requested: [...openTargets('info_requested'), 'accepted', 'rejected', 'withdrawn'],
  waitlisted: [...openTargets('waitlisted'), 'accepted', 'rejected', 'withdrawn'],
  accepted: ['confirmed', 'rejected', 'withdrawn'],
  confirmed: ['withdrawn'],
  rejected: [],
  withdrawn: [],
}

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: Status, to: Status): void {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot move an application from ${from} to ${to}.`)
  }
}

/** Applicants may only edit while no decision has been made. */
export function isEditable(status: Status): boolean {
  return status === 'submitted' || status === 'under_review' || status === 'info_requested'
}

export const STATUS_LABELS: Record<Status, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  info_requested: 'More information needed',
  waitlisted: 'Waitlisted',
  accepted: 'Accepted',
  confirmed: 'Confirmed',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
}

/** Decisions that have a default email. Everything else is an internal move. */
export const DECISION_TEMPLATE_KEYS: Partial<Record<Status, string>> = {
  accepted: 'accepted',
  rejected: 'rejected',
  waitlisted: 'waitlisted',
  info_requested: 'info_request',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/status.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/application.ts tests/unit/status.test.ts
git commit -m "feat(domain): guarded application status machine"
```

---

### Task 2: Magic-link tokens and cookie sessions

**Files:**
- Create: `src/services/auth/tokens.ts`, `src/services/auth/session.ts`
- Modify: `src/services/applications.ts` (import token helpers instead of defining them)
- Test: `tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `type Db`, `authTokens`, `sessions`, `admins`, `applications` from `@/db/schema`.
- Produces:
  - `src/services/auth/tokens.ts`: `newToken(): string`; `hashToken(token: string): string`; `ADMIN_TOKEN_MINUTES = 30`; `APPLICANT_TOKEN_DAYS = 7`; `issueToken(tx: Db, input: { purpose: 'admin_login' | 'applicant_portal'; adminId?: string; applicationId?: string; requestedIp?: string }): Promise<string>`; `consumeToken(raw: string, purpose: 'admin_login' | 'applicant_portal'): Promise<{ adminId: string | null; applicationId: string | null } | null>`.
  - `src/services/auth/session.ts`: `ADMIN_COOKIE = 'booth_admin'`; `APPLICANT_COOKIE = 'booth_applicant'`; `createAdminSession(adminId: string): Promise<void>`; `createApplicantSession(applicationId: string): Promise<void>`; `getAdminSession(): Promise<typeof admins.$inferSelect | null>`; `getApplicantSession(): Promise<typeof applications.$inferSelect | null>`; `requireAdmin(): Promise<typeof admins.$inferSelect>` (redirects to `/admin/login`); `requireApplicant(): Promise<typeof applications.$inferSelect>` (redirects to `/portal`); `destroyAdminSession(): Promise<void>`; `destroyApplicantSession(): Promise<void>`.
- `src/services/applications.ts` keeps exporting `hashToken` and `newToken` as re-exports so nothing that imports them breaks.

- [ ] **Step 1: Write the failing test**

`tests/integration/auth.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { admins, applications, authTokens } from '@/db/schema'
import { consumeToken, hashToken, issueToken, newToken } from '@/services/auth/tokens'

const db = getDb()

async function anAdmin() {
  const [row] = await db
    .insert(admins)
    .values({ email: `admin+${Date.now()}@example.org`, name: 'Test Admin' })
    .returning()
  return row
}

async function anApplication() {
  const [row] = await db
    .insert(applications)
    .values({
      orgName: 'Debian',
      contactName: 'A Maintainer',
      contactEmail: `maintainer+${Date.now()}@example.org`,
      website: 'https://www.debian.org',
      about: 'a'.repeat(120),
      showcase: 'b'.repeat(120),
      communityImpact: 'c'.repeat(120),
      staffingPlan: 'd'.repeat(120),
      signText: 'Debian',
    })
    .returning()
  return row
}

beforeEach(async () => {
  await db.delete(authTokens)
})

afterAll(async () => {
  await closeDb()
})

describe('newToken', () => {
  it('produces a long URL-safe string', () => {
    expect(newToken()).toMatch(/^[A-Za-z0-9_-]{40,}$/)
  })

  it('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => newToken()))
    expect(seen.size).toBe(200)
  })
})

describe('issueToken', () => {
  it('stores only the hash, never the raw token', async () => {
    const application = await anApplication()
    const raw = await issueToken(db, { purpose: 'applicant_portal', applicationId: application.id })

    const rows = await db.select().from(authTokens)
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenHash).toBe(hashToken(raw))
    expect(rows[0].tokenHash).not.toBe(raw)
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('consumeToken', () => {
  it('returns the subject and marks the token used', async () => {
    const application = await anApplication()
    const raw = await issueToken(db, { purpose: 'applicant_portal', applicationId: application.id })

    const result = await consumeToken(raw, 'applicant_portal')
    expect(result?.applicationId).toBe(application.id)

    const [row] = await db.select().from(authTokens)
    expect(row.consumedAt).toBeInstanceOf(Date)
  })

  it('refuses a token a second time', async () => {
    const application = await anApplication()
    const raw = await issueToken(db, { purpose: 'applicant_portal', applicationId: application.id })

    await consumeToken(raw, 'applicant_portal')
    expect(await consumeToken(raw, 'applicant_portal')).toBeNull()
  })

  it('refuses a token issued for a different purpose', async () => {
    const admin = await anAdmin()
    const raw = await issueToken(db, { purpose: 'admin_login', adminId: admin.id })
    expect(await consumeToken(raw, 'applicant_portal')).toBeNull()
  })

  it('refuses an expired token', async () => {
    const admin = await anAdmin()
    const raw = await issueToken(db, { purpose: 'admin_login', adminId: admin.id })
    await db
      .update(authTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authTokens.tokenHash, hashToken(raw)))

    expect(await consumeToken(raw, 'admin_login')).toBeNull()
  })

  it('refuses a token that was never issued', async () => {
    expect(await consumeToken(newToken(), 'admin_login')).toBeNull()
  })

  it('gives an admin token a much shorter life than an applicant token', async () => {
    const admin = await anAdmin()
    const application = await anApplication()

    await issueToken(db, { purpose: 'admin_login', adminId: admin.id })
    const [adminRow] = await db.select().from(authTokens)
    await db.delete(authTokens)

    await issueToken(db, { purpose: 'applicant_portal', applicationId: application.id })
    const [applicantRow] = await db.select().from(authTokens)

    expect(applicantRow.expiresAt.getTime()).toBeGreaterThan(adminRow.expiresAt.getTime())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/auth.test.ts`
Expected: FAIL — cannot resolve `@/services/auth/tokens`.

- [ ] **Step 3: Write `src/services/auth/tokens.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { getDb, type Db } from '@/db/client'
import { authTokens } from '@/db/schema'

export const ADMIN_TOKEN_MINUTES = 30
export const APPLICANT_TOKEN_DAYS = 7

export type TokenPurpose = 'admin_login' | 'applicant_portal'

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function expiryFor(purpose: TokenPurpose): Date {
  const ms =
    purpose === 'admin_login'
      ? ADMIN_TOKEN_MINUTES * 60_000
      : APPLICANT_TOKEN_DAYS * 86_400_000
  return new Date(Date.now() + ms)
}

export interface IssueTokenInput {
  purpose: TokenPurpose
  adminId?: string
  applicationId?: string
  requestedIp?: string
}

/** Returns the raw token. It is never stored — only its hash is. */
export async function issueToken(tx: Db, input: IssueTokenInput): Promise<string> {
  const raw = newToken()
  await tx.insert(authTokens).values({
    tokenHash: hashToken(raw),
    purpose: input.purpose,
    adminId: input.adminId ?? null,
    applicationId: input.applicationId ?? null,
    expiresAt: expiryFor(input.purpose),
    requestedIp: input.requestedIp ?? null,
  })
  return raw
}

/**
 * Redeems a token exactly once. The UPDATE carries the unconsumed and
 * unexpired conditions, so two simultaneous requests cannot both win.
 */
export async function consumeToken(
  raw: string,
  purpose: TokenPurpose,
): Promise<{ adminId: string | null; applicationId: string | null } | null> {
  const [row] = await getDb()
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(raw)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning({ adminId: authTokens.adminId, applicationId: authTokens.applicationId })

  return row ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/auth.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Point `services/applications.ts` at the shared helpers**

In `src/services/applications.ts`, delete the local `hashToken`, `newToken` and `APPLICANT_TOKEN_DAYS` definitions and the `node:crypto` import, then re-export from the new module so existing importers keep working:

```ts
import { APPLICANT_TOKEN_DAYS, hashToken, newToken } from '@/services/auth/tokens'

export { APPLICANT_TOKEN_DAYS, hashToken, newToken }
```

The body of `createApplication` is unchanged — it already calls `newToken()` and `hashToken()`.

- [ ] **Step 6: Confirm nothing regressed**

Run: `npm test`
Expected: PASS — the Plan A submission tests still pass against the moved helpers.

- [ ] **Step 7: Write `src/services/auth/session.ts`**

```ts
import { and, eq, gt } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { admins, applications, sessions } from '@/db/schema'
import { hashToken, newToken } from './tokens'

export const ADMIN_COOKIE = 'booth_admin'
export const APPLICANT_COOKIE = 'booth_applicant'

const ADMIN_SESSION_DAYS = 7
const APPLICANT_SESSION_DAYS = 30

async function startSession(
  cookieName: string,
  days: number,
  subject: { subjectType: 'admin' | 'applicant'; adminId?: string; applicationId?: string },
): Promise<void> {
  const raw = newToken()
  const expiresAt = new Date(Date.now() + days * 86_400_000)

  await getDb().insert(sessions).values({
    tokenHash: hashToken(raw),
    subjectType: subject.subjectType,
    adminId: subject.adminId ?? null,
    applicationId: subject.applicationId ?? null,
    expiresAt,
  })

  const store = await cookies()
  store.set(cookieName, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function createAdminSession(adminId: string): Promise<void> {
  await startSession(ADMIN_COOKIE, ADMIN_SESSION_DAYS, { subjectType: 'admin', adminId })
}

export async function createApplicantSession(applicationId: string): Promise<void> {
  await startSession(APPLICANT_COOKIE, APPLICANT_SESSION_DAYS, {
    subjectType: 'applicant',
    applicationId,
  })
}

async function readSession(cookieName: string, subjectType: 'admin' | 'applicant') {
  const raw = (await cookies()).get(cookieName)?.value
  if (!raw) return null

  const db = getDb()
  const [row] = await db
    .update(sessions)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(sessions.tokenHash, hashToken(raw)),
        eq(sessions.subjectType, subjectType),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .returning()

  return row ?? null
}

export async function getAdminSession(): Promise<typeof admins.$inferSelect | null> {
  const session = await readSession(ADMIN_COOKIE, 'admin')
  if (!session?.adminId) return null

  const admin = await getDb().query.admins.findFirst({ where: eq(admins.id, session.adminId) })
  // A deactivated admin keeps their cookie but loses access immediately.
  return admin?.isActive ? admin : null
}

export async function getApplicantSession(): Promise<typeof applications.$inferSelect | null> {
  const session = await readSession(APPLICANT_COOKIE, 'applicant')
  if (!session?.applicationId) return null

  return (
    (await getDb().query.applications.findFirst({
      where: eq(applications.id, session.applicationId),
    })) ?? null
  )
}

export async function requireAdmin(): Promise<typeof admins.$inferSelect> {
  const admin = await getAdminSession()
  if (!admin) redirect('/admin/login')
  return admin
}

export async function requireApplicant(): Promise<typeof applications.$inferSelect> {
  const application = await getApplicantSession()
  if (!application) redirect('/portal')
  return application
}

async function destroy(cookieName: string): Promise<void> {
  const store = await cookies()
  const raw = store.get(cookieName)?.value
  if (raw) {
    await getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(raw)))
  }
  store.delete(cookieName)
}

export async function destroyAdminSession(): Promise<void> {
  await destroy(ADMIN_COOKIE)
}

export async function destroyApplicantSession(): Promise<void> {
  await destroy(APPLICANT_COOKIE)
}
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): single-use magic-link tokens and cookie sessions"
```

---

### Task 3: Shared display components and the logo route

**Files:**
- Create: `src/components/StatusBadge.tsx`, `src/components/Prose.tsx`, `src/app/logo/[id]/route.ts`
- Test: `tests/integration/logo-route.test.ts`

**Interfaces:**
- Consumes: `STATUS_LABELS`, `type Status` from `@/domain/application`; `getAdminSession`, `getApplicantSession` from `@/services/auth/session`; `uploads`, `applications` from `@/db/schema`.
- Produces: `<StatusBadge status={Status} />`; `<Prose text={string} />`; `GET(request, { params })` at `/logo/[id]`; `canSeeUpload(uploadId: string, viewer: { adminId?: string; applicationId?: string }): Promise<boolean>` exported from the route module for testing.

- [ ] **Step 1: Write the failing test**

`tests/integration/logo-route.test.ts`:

```ts
import { afterAll, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '@/db/client'
import { applications, uploads } from '@/db/schema'
import { canSeeUpload } from '@/app/logo/[id]/route'

const db = getDb()

afterAll(async () => {
  await closeDb()
})

async function anApplicationWithLogo() {
  const [application] = await db
    .insert(applications)
    .values({
      orgName: 'Debian',
      contactName: 'A Maintainer',
      contactEmail: `maintainer+${Date.now()}@example.org`,
      website: 'https://www.debian.org',
      about: 'a'.repeat(120),
      showcase: 'b'.repeat(120),
      communityImpact: 'c'.repeat(120),
      staffingPlan: 'd'.repeat(120),
      signText: 'Debian',
    })
    .returning()

  const [upload] = await db
    .insert(uploads)
    .values({
      applicationId: application.id,
      filename: 'logo.png',
      contentType: 'image/png',
      byteSize: 4,
      sha256: 'abc',
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    })
    .returning()

  return { application, upload }
}

describe('canSeeUpload', () => {
  it('lets any admin see any logo', async () => {
    const { upload } = await anApplicationWithLogo()
    expect(await canSeeUpload(upload.id, { adminId: 'any-admin-id' })).toBe(true)
  })

  it('lets an applicant see their own logo', async () => {
    const { application, upload } = await anApplicationWithLogo()
    expect(await canSeeUpload(upload.id, { applicationId: application.id })).toBe(true)
  })

  it('refuses an applicant another organization’s logo', async () => {
    const mine = await anApplicationWithLogo()
    const theirs = await anApplicationWithLogo()
    expect(await canSeeUpload(theirs.upload.id, { applicationId: mine.application.id })).toBe(false)
  })

  it('refuses an anonymous viewer', async () => {
    const { upload } = await anApplicationWithLogo()
    expect(await canSeeUpload(upload.id, {})).toBe(false)
  })

  it('refuses an unknown upload id', async () => {
    expect(
      await canSeeUpload('00000000-0000-0000-0000-000000000000', { adminId: 'any' }),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/logo-route.test.ts`
Expected: FAIL — cannot resolve `@/app/logo/[id]/route`.

- [ ] **Step 3: Write `src/app/logo/[id]/route.ts`**

```ts
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { uploads } from '@/db/schema'
import { getAdminSession, getApplicantSession } from '@/services/auth/session'

export const dynamic = 'force-dynamic'

export async function canSeeUpload(
  uploadId: string,
  viewer: { adminId?: string; applicationId?: string },
): Promise<boolean> {
  const upload = await getDb().query.uploads.findFirst({ where: eq(uploads.id, uploadId) })
  if (!upload) return false
  if (viewer.adminId) return true
  return Boolean(viewer.applicationId) && upload.applicationId === viewer.applicationId
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const admin = await getAdminSession()
  const applicant = admin ? null : await getApplicantSession()

  const allowed = await canSeeUpload(id, {
    adminId: admin?.id,
    applicationId: applicant?.id,
  })
  if (!allowed) return new Response('Not found', { status: 404 })

  const upload = await getDb().query.uploads.findFirst({ where: eq(uploads.id, id) })
  if (!upload) return new Response('Not found', { status: 404 })

  return new Response(new Uint8Array(upload.data), {
    headers: {
      'Content-Type': upload.contentType,
      'Content-Length': String(upload.byteSize),
      'Content-Disposition': `inline; filename="${upload.filename}"`,
      // Private: these bytes are access-checked, so no shared cache may hold them.
      'Cache-Control': 'private, max-age=3600',
      ETag: `"${upload.sha256}"`,
      // An uploaded SVG is sanitized, but deny scripting at the browser too.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/integration/logo-route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the display components**

`src/components/StatusBadge.tsx`:

```tsx
import { STATUS_LABELS, type Status } from '@/domain/application'

const TONE: Record<Status, string> = {
  submitted: 'bg-scale-blue-pale/40 text-scale-blue-dark',
  under_review: 'bg-scale-blue-pale/40 text-scale-blue-dark',
  info_requested: 'bg-scale-gold-pale text-scale-ink',
  waitlisted: 'bg-scale-gold-pale text-scale-ink',
  accepted: 'bg-green-100 text-green-900',
  confirmed: 'bg-green-600 text-white',
  rejected: 'bg-neutral-200 text-neutral-800',
  withdrawn: 'bg-neutral-200 text-neutral-800',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${TONE[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
```

`src/components/Prose.tsx`:

```tsx
/**
 * Renders a stored free-text answer. React escapes the content, and splitting
 * on blank lines keeps the applicant's paragraphing without accepting markup.
 */
export function Prose({ text }: { text: string }) {
  return (
    <div className="space-y-3 whitespace-pre-wrap text-scale-muted">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: access-checked logo route, status badge, prose renderer"
```

---

### Task 4: Applicant portal — request a link, enter, and view

**Files:**
- Create: `src/app/portal/page.tsx`, `src/app/portal/actions.ts`, `src/app/portal/enter/route.ts`, `src/app/portal/application/page.tsx`
- Modify: `src/services/mail/templates.ts` (add `magic_link_admin`, `info_request`, `waitlisted`, `accepted`, `rejected`, `admin_reply_notification`)
- Test: `tests/integration/portal-link.test.ts`, `tests/e2e/portal.spec.ts`

**Interfaces:**
- Consumes: `issueToken`, `consumeToken` from `@/services/auth/tokens`; `createApplicantSession`, `requireApplicant` from `@/services/auth/session`; `enqueueEmail`, `renderTemplate`, `hit`, `normalizeEmail`, `loadSettings`, `formatFee`, `<StatusBadge>`, `<Prose>`.
- Produces: `requestPortalLink(prev: PortalFormState, formData: FormData): Promise<PortalFormState>` from `src/app/portal/actions.ts`, where `type PortalFormState = { sent: boolean; error?: string }`; `sendPortalLink(email: string): Promise<void>` from the same module (exported for testing; sends only if an application exists).

- [ ] **Step 1: Write the failing integration test**

`tests/integration/portal-link.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb } from '@/db/client'
import { applications, authTokens, emailOutbox } from '@/db/schema'
import { sendPortalLink } from '@/app/portal/actions'

const db = getDb()

beforeEach(async () => {
  await db.delete(emailOutbox)
  await db.delete(authTokens)
  await db.delete(applications)
})

afterAll(async () => {
  await closeDb()
})

async function anApplication(email: string) {
  const [row] = await db
    .insert(applications)
    .values({
      orgName: 'Debian',
      contactName: 'A Maintainer',
      contactEmail: email,
      website: 'https://www.debian.org',
      about: 'a'.repeat(120),
      showcase: 'b'.repeat(120),
      communityImpact: 'c'.repeat(120),
      staffingPlan: 'd'.repeat(120),
      signText: 'Debian',
    })
    .returning()
  return row
}

describe('sendPortalLink', () => {
  it('queues a link for an address that has an application', async () => {
    await anApplication('maintainer@example.org')
    await sendPortalLink('maintainer@example.org')

    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].toEmail).toBe('maintainer@example.org')
    expect(outbox[0].bodyText).toContain('/portal/enter?token=')

    expect(await db.select().from(authTokens)).toHaveLength(1)
  })

  it('matches the address case-insensitively', async () => {
    await anApplication('maintainer@example.org')
    await sendPortalLink('Maintainer@Example.ORG')
    expect(await db.select().from(emailOutbox)).toHaveLength(1)
  })

  it('queues nothing for an address with no application', async () => {
    await sendPortalLink('nobody@example.org')
    expect(await db.select().from(emailOutbox)).toHaveLength(0)
    expect(await db.select().from(authTokens)).toHaveLength(0)
  })

  it('sends for the most recent application when an org applied twice', async () => {
    await anApplication('maintainer@example.org')
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await anApplication('maintainer@example.org')

    await sendPortalLink('maintainer@example.org')

    const [token] = await db.select().from(authTokens)
    expect(token.applicationId).toBe(second.id)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/portal-link.test.ts`
Expected: FAIL — cannot resolve `@/app/portal/actions`.

- [ ] **Step 3: Add the remaining templates**

Append these to the `DEFAULT_TEMPLATES` array in `src/services/mail/templates.ts`:

```ts
  {
    key: 'magic_link_admin',
    name: 'Admin sign-in link',
    subject: 'Your {{event}} Community Booths admin link',
    body:
      `Hi {{admin_name}},\n\n` +
      `Here is your sign-in link for the Community Booths admin console:\n\n` +
      `{{admin_url}}\n\n` +
      `It works once and expires in 30 minutes. If you did not ask for it, ignore this email.` +
      SIGNOFF,
    variables: ['admin_name', 'event', 'admin_url', 'contact_email'],
  },
  {
    key: 'accepted',
    name: 'Application accepted',
    subject: 'Your {{event}} community booth is confirmed pending your acceptance',
    body:
      `Hi {{contact_name}},\n\n` +
      `Good news — we have a community booth for {{org_name}} at {{event}}.\n\n` +
      `Please confirm the booth and the booth terms here:\n\n` +
      `{{portal_url}}\n\n` +
      `The booth is free. Please note that if you cancel fewer than 30 days before the event, ` +
      `or do not occupy your booth during the show, a late cancellation fee of {{fee}} applies. ` +
      `The full terms are on that page.\n\n` +
      `We would always rather hear from you early than charge that fee, so tell us as soon as ` +
      `you know if anything changes.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'portal_url', 'fee', 'contact_email'],
  },
  {
    key: 'rejected',
    name: 'Application not accepted',
    subject: 'About your {{event}} community booth application',
    body:
      `Hi {{contact_name}},\n\n` +
      `Thank you for applying for a community booth at {{event}} on behalf of {{org_name}}.\n\n` +
      `We had more applications than booths this year and were not able to offer you one. ` +
      `This is not a judgement on your project — the expo floor is simply smaller than the ` +
      `community it serves.\n\n` +
      `We would genuinely like to see you apply again next year.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'contact_email'],
  },
  {
    key: 'waitlisted',
    name: 'Application waitlisted',
    subject: 'Your {{event}} community booth application is waitlisted',
    body:
      `Hi {{contact_name}},\n\n` +
      `We would like to give {{org_name}} a booth at {{event}}, but we are full right now. ` +
      `You are on the waitlist, and booths do free up.\n\n` +
      `You can check your status here at any time:\n\n` +
      `{{portal_url}}\n\n` +
      `We will write again as soon as we know either way.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'portal_url', 'contact_email'],
  },
  {
    key: 'info_request',
    name: 'More information needed',
    subject: 'A question about your {{event}} booth application',
    body:
      `Hi {{contact_name}},\n\n` +
      `We are reviewing {{org_name}}'s community booth application and need a little more from you.\n\n` +
      `Open your application to read our question and reply:\n\n` +
      `{{portal_url}}\n\n` +
      `You can also edit your answers there while applications are open.` +
      SIGNOFF,
    variables: ['contact_name', 'org_name', 'event', 'portal_url', 'contact_email'],
  },
  {
    key: 'admin_reply_notification',
    name: 'Applicant replied (to admins)',
    subject: '{{org_name}} replied about their community booth',
    body:
      `{{org_name}} has replied on their community booth application.\n\n` +
      `Read and answer it here:\n\n` +
      `{{admin_url}}`,
    variables: ['org_name', 'admin_url'],
  },
```

- [ ] **Step 4: Write `src/app/portal/actions.ts`**

```ts
'use server'

import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { getDb } from '@/db/client'
import { applications, emailTemplates } from '@/db/schema'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { normalizeEmail } from '@/lib/email'
import { hit } from '@/lib/ratelimit'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'
import { issueToken } from '@/services/auth/tokens'

export interface PortalFormState {
  sent: boolean
  error?: string
}

/** Queues a portal link, but only if that address actually has an application. */
export async function sendPortalLink(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail)
  const db = getDb()

  const application = await db.query.applications.findFirst({
    where: eq(applications.contactEmail, email),
    orderBy: [desc(applications.submittedAt)],
  })
  if (!application) return

  await db.transaction(async (tx) => {
    const token = await issueToken(tx, {
      purpose: 'applicant_portal',
      applicationId: application.id,
    })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'magic_link_applicant'),
    })
    if (!template) throw new Error('Missing email template: magic_link_applicant')

    const rendered = renderTemplate(template, {
      event: EVENT.name,
      contact_email: EVENT.contactEmail,
      portal_url: `${getEnv().PUBLIC_BASE_URL}/portal/enter?token=${token}`,
    })

    await enqueueEmail(tx, {
      to: application.contactEmail,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })
  })
}

export async function requestPortalLink(
  _prev: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  if (!email.includes('@')) {
    return { sent: false, error: 'Enter the email address you applied with.' }
  }

  // Limit by address, not by IP: a shared office NAT should not lock out a
  // second organization applying from the same building.
  if (!hit(`portal-link:${email}`, 3, 3_600_000)) {
    // Still answer identically, so the limiter cannot be used to probe addresses.
    return { sent: true }
  }

  const forwarded = (await headers()).get('x-forwarded-for') ?? 'unknown'
  if (!hit(`portal-link-ip:${forwarded.split(',')[0]!.trim()}`, 20, 3_600_000)) {
    return { sent: true }
  }

  await sendPortalLink(email)
  // Identical response whether or not an application exists.
  return { sent: true }
}
```

- [ ] **Step 5: Run the integration test to verify it passes**

Run: `npm run db:seed && npx vitest run tests/integration/portal-link.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the portal request page**

`src/app/portal/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { requestPortalLink, type PortalFormState } from './actions'

const initial: PortalFormState = { sent: false }

export default function Portal() {
  const [state, action, pending] = useActionState(requestPortalLink, initial)

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-4xl font-bold">Your booth application</h1>

      {state.sent ? (
        <div id="portal-sent" className="mt-6 rounded border-l-4 border-scale-blue bg-scale-blue-pale/25 p-4">
          <p className="font-semibold">Check your email.</p>
          <p className="mt-2 text-scale-muted">
            If we have an application for that address, we have sent a link to it. The link works
            for 7 days.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-scale-muted">
            Enter the email address you applied with and we will send you a link to your
            application.
          </p>
          <form action={action} noValidate className="mt-8">
            <Field label="Email address" name="email" error={state.error}>
              <input id="email" name="email" type="email" required className={inputClass} />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Email me a link'}
            </Button>
          </form>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Write the token-redemption route**

`src/app/portal/enter/route.ts`:

```ts
import { redirect } from 'next/navigation'
import { createApplicantSession } from '@/services/auth/session'
import { consumeToken } from '@/services/auth/tokens'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) redirect('/portal?expired=1')

  const subject = await consumeToken(token, 'applicant_portal')
  if (!subject?.applicationId) redirect('/portal?expired=1')

  await createApplicantSession(subject.applicationId)
  redirect('/portal/application')
}
```

- [ ] **Step 8: Write the application view**

`src/app/portal/application/page.tsx`:

```tsx
import { asc, eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { messages } from '@/db/schema'
import { Prose } from '@/components/Prose'
import { StatusBadge } from '@/components/StatusBadge'
import { EVENT } from '@/event'
import { STATUS_LABELS, type Status } from '@/domain/application'
import { requireApplicant } from '@/services/auth/session'

export const dynamic = 'force-dynamic'

const ANSWERS = [
  ['About the organization', 'about'],
  ['What they will showcase', 'showcase'],
  ['How it advances advocacy', 'communityImpact'],
  ['Staffing plan', 'staffingPlan'],
] as const

export default async function ApplicationView() {
  const application = await requireApplicant()
  const thread = await getDb().query.messages.findMany({
    where: eq(messages.applicationId, application.id),
    orderBy: [asc(messages.createdAt)],
  })

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-bold">{application.orgName}</h1>
        <StatusBadge status={application.status as Status} />
      </div>
      <p className="mt-2 text-scale-muted">
        Community booth application for {EVENT.name}, submitted{' '}
        {application.submittedAt.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'America/Los_Angeles',
        })}
        .
      </p>

      {application.boothNumber && (
        <p className="mt-4 rounded bg-scale-blue-pale/30 px-4 py-3">
          Your booth number is <strong>{application.boothNumber}</strong>.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-2xl font-bold">Your answers</h2>
        <dl className="mt-4 space-y-6">
          <div>
            <dt className="font-semibold">Contact</dt>
            <dd className="text-scale-muted">
              {application.contactName} &middot; {application.contactEmail}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Website</dt>
            <dd>
              <a className="text-scale-blue underline" href={application.website}>
                {application.website}
              </a>
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Booth sign text</dt>
            <dd className="text-scale-muted">{application.signText}</dd>
          </div>
          {application.logoUploadId && (
            <div>
              <dt className="font-semibold">Logo</dt>
              <dd className="mt-2">
                <img
                  src={`/logo/${application.logoUploadId}`}
                  alt={`${application.orgName} logo`}
                  className="max-h-32 rounded border border-scale-rule/40 bg-white p-2"
                />
              </dd>
            </div>
          )}
          {ANSWERS.map(([label, field]) => (
            <div key={field}>
              <dt className="font-semibold">{label}</dt>
              <dd className="mt-1">
                <Prose text={application[field]} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold">Messages</h2>
        {thread.length === 0 ? (
          <p className="mt-3 text-scale-muted">
            No messages yet. We will write here when we have news or a question.
          </p>
        ) : (
          <ul className="mt-4 space-y-6">
            {thread.map((message) => (
              <li
                key={message.id}
                className={`rounded border p-4 ${
                  message.direction === 'outbound'
                    ? 'border-scale-blue-pale bg-scale-blue-pale/15'
                    : 'border-scale-rule/40 bg-white'
                }`}
              >
                <p className="text-sm font-semibold text-scale-muted">
                  {message.direction === 'outbound' ? 'SCaLE' : 'You'} &middot;{' '}
                  {message.createdAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}
                </p>
                <p className="mt-1 font-semibold">{message.subject}</p>
                <div className="mt-2">
                  <Prose text={message.body} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-12 text-sm text-scale-muted">
        Current status: {STATUS_LABELS[application.status as Status]}. Questions? Write to{' '}
        <a className="text-scale-blue underline" href={`mailto:${EVENT.contactEmail}`}>
          {EVENT.contactEmail}
        </a>
        .
      </p>
    </main>
  )
}
```

- [ ] **Step 9: Write the end-to-end test**

`tests/e2e/portal.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
)
const LONG = 'We are a long-running free software project with an active community. '.repeat(3)

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.77' } })

async function applyAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/apply')
  await page.getByLabel('Organization name').fill('Debian')
  await page.getByLabel('Contact name').fill('A Maintainer')
  await page.getByLabel('Contact email').fill(email)
  await page.getByLabel('Website').fill('debian.org')
  await page.getByLabel('Tell us about your organization').fill(LONG)
  await page.getByLabel('What will you showcase at your booth?').fill(LONG)
  await page.getByLabel('How does this advance advocacy and interest attendees?').fill(LONG)
  await page.getByLabel('How will you keep someone at the booth at all times?').fill(LONG)
  await page.getByLabel('Booth sign text').fill('The Debian Project')
  await page.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: /submit application/i }).click()
  await expect(page.getByRole('heading', { name: /application received/i })).toBeVisible()
}

/** Pulls the most recent link out of Mailpit for this address. */
async function portalLinkFor(email: string): Promise<string> {
  const search = await fetch(
    `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
  )
  const { messages } = (await search.json()) as { messages: Array<{ ID: string }> }
  expect(messages.length).toBeGreaterThan(0)

  const detail = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`)
  const { Text } = (await detail.json()) as { Text: string }
  const match = Text.match(/http:\/\/localhost:3000\/portal\/enter\?token=[A-Za-z0-9_-]+/)
  expect(match).not.toBeNull()
  return match![0]
}

test('an applicant can reach their application from the receipt email', async ({ page, request }) => {
  const email = `maintainer+portal${Date.now()}@example.org`
  await applyAs(page, email)

  // Flush the outbox through Mailpit.
  await request.post('/api/dev/dispatch')

  await page.goto(await portalLinkFor(email))

  await expect(page.getByRole('heading', { name: 'Debian' })).toBeVisible()
  await expect(page.getByText('Submitted')).toBeVisible()
  await expect(page.getByText('The Debian Project')).toBeVisible()
})

test('the portal does not reveal whether an address has an application', async ({ page }) => {
  await page.goto('/portal')
  await page.getByLabel('Email address').fill('definitely-nobody@example.org')
  await page.getByRole('button', { name: /email me a link/i }).click()
  await expect(page.locator('#portal-sent')).toContainText('If we have an application')
})

test('a used link cannot be used twice', async ({ page, request }) => {
  const email = `maintainer+once${Date.now()}@example.org`
  await applyAs(page, email)
  await request.post('/api/dev/dispatch')

  const link = await portalLinkFor(email)
  await page.goto(link)
  await expect(page.getByRole('heading', { name: 'Debian' })).toBeVisible()

  await page.context().clearCookies()
  await page.goto(link)
  await expect(page.getByRole('heading', { name: /your booth application/i })).toBeVisible()
})
```

- [ ] **Step 10: Add the dev-only dispatch endpoint the test uses**

`src/app/api/dev/dispatch/route.ts`:

```ts
import { dispatchPending } from '@/services/mail/outbox'

export const dynamic = 'force-dynamic'

/**
 * Flushes the outbox on demand. Development only — production runs the worker
 * on a timer, and this route must never become a way to trigger sending.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }
  return Response.json(await dispatchPending())
}
```

- [ ] **Step 11: Run the end-to-end test**

Run: `npx playwright test tests/e2e/portal.spec.ts`
Expected: PASS, 3 tests.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(portal): magic-link entry and the applicant's application view"
```

---

### Task 5: Applicant portal — edit and withdraw

**Files:**
- Create: `src/app/portal/application/EditForm.tsx`, `src/app/portal/application/actions.ts`
- Modify: `src/app/portal/application/page.tsx` (render the edit form and withdraw button)
- Test: `tests/integration/portal-edit.test.ts`, `tests/e2e/portal-edit.spec.ts`

**Interfaces:**
- Consumes: `applicationInputSchema`, `isEditable`, `requireApplicant`, `windowState`, `loadSettings`, `prepareUpload`.
- Produces: from `src/app/portal/application/actions.ts`: `type EditState = { errors: Record<string, string>; message?: string; saved?: boolean }`; `saveApplication(prev: EditState, formData: FormData): Promise<EditState>`; `withdrawApplication(): Promise<void>`; `applyEdit(applicationId: string, input: ApplicationInput, logo: PreparedUpload | null): Promise<void>` (exported for testing).

- [ ] **Step 1: Write the failing integration test**

`tests/integration/portal-edit.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { applications, uploads } from '@/db/schema'
import { applyEdit } from '@/app/portal/application/actions'
import { prepareUpload } from '@/services/uploads'

const db = getDb()

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])

const valid = {
  orgName: 'Debian',
  contactName: 'A Maintainer',
  contactEmail: 'maintainer@example.org',
  website: 'https://www.debian.org',
  about: 'a'.repeat(120),
  showcase: 'b'.repeat(120),
  communityImpact: 'c'.repeat(120),
  staffingPlan: 'd'.repeat(120),
  signText: 'Debian',
}

beforeEach(async () => {
  await db.delete(applications)
})

afterAll(async () => {
  await closeDb()
})

async function seeded() {
  const [row] = await db.insert(applications).values(valid).returning()
  const prepared = prepareUpload('logo.png', png)
  if (!prepared.ok) throw new Error(prepared.error)
  const [upload] = await db
    .insert(uploads)
    .values({ ...prepared.value, applicationId: row.id })
    .returning()
  await db.update(applications).set({ logoUploadId: upload.id }).where(eq(applications.id, row.id))
  return { application: row, uploadId: upload.id }
}

describe('applyEdit', () => {
  it('saves changed answers', async () => {
    const { application } = await seeded()
    await applyEdit(application.id, { ...valid, orgName: 'The Debian Project' }, null)

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.orgName).toBe('The Debian Project')
  })

  it('bumps updatedAt', async () => {
    const { application } = await seeded()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await applyEdit(application.id, { ...valid, signText: 'Debian!' }, null)

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after!.updatedAt.getTime()).toBeGreaterThan(application.updatedAt.getTime())
  })

  it('keeps the existing logo when none is uploaded', async () => {
    const { application, uploadId } = await seeded()
    await applyEdit(application.id, valid, null)

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.logoUploadId).toBe(uploadId)
  })

  it('replaces the logo when a new one is uploaded, keeping the old row as history', async () => {
    const { application, uploadId } = await seeded()
    const prepared = prepareUpload('new.jpg', jpeg)
    if (!prepared.ok) throw new Error(prepared.error)

    await applyEdit(application.id, valid, prepared.value)

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.logoUploadId).not.toBe(uploadId)

    const all = await db.select().from(uploads).where(eq(uploads.applicationId, application.id))
    expect(all).toHaveLength(2)
  })

  it('never changes the status', async () => {
    const { application } = await seeded()
    await db.update(applications).set({ status: 'under_review' }).where(eq(applications.id, application.id))

    await applyEdit(application.id, { ...valid, orgName: 'Changed' }, null)

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('under_review')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/portal-edit.test.ts`
Expected: FAIL — cannot resolve `@/app/portal/application/actions`.

- [ ] **Step 3: Write `src/app/portal/application/actions.ts`**

```ts
'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { applications, auditLog, uploads } from '@/db/schema'
import { isEditable, type Status } from '@/domain/application'
import { windowState } from '@/domain/settings'
import { loadSettings } from '@/lib/settings'
import { destroyApplicantSession, requireApplicant } from '@/services/auth/session'
import { prepareUpload, type PreparedUpload } from '@/services/uploads'
import { applicationInputSchema, type ApplicationInput } from '@/validation/application'

export interface EditState {
  errors: Record<string, string>
  message?: string
  saved?: boolean
}

export async function applyEdit(
  applicationId: string,
  input: ApplicationInput,
  logo: PreparedUpload | null,
): Promise<void> {
  const db = getDb()

  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(applications.id, applicationId))

    if (logo) {
      const [upload] = await tx
        .insert(uploads)
        .values({ ...logo, applicationId })
        .returning({ id: uploads.id })
      // The previous upload row stays as cheap history.
      await tx
        .update(applications)
        .set({ logoUploadId: upload.id })
        .where(eq(applications.id, applicationId))
    }

    await tx.insert(auditLog).values({
      actorType: 'applicant',
      actorId: applicationId,
      applicationId,
      action: 'application.edited',
      detail: { replacedLogo: Boolean(logo) },
    })
  })
}

export async function saveApplication(_prev: EditState, formData: FormData): Promise<EditState> {
  const application = await requireApplicant()
  const settings = await loadSettings()

  if (!isEditable(application.status as Status)) {
    return { errors: {}, message: 'This application can no longer be edited.' }
  }
  if (windowState(settings, new Date()) !== 'open') {
    return { errors: {}, message: 'Applications are closed, so this can no longer be edited.' }
  }

  const parsed = applicationInputSchema.safeParse(Object.fromEntries(formData))
  const errors: Record<string, string> = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0])
      errors[key] ??= issue.message
    }
  }

  let logo: PreparedUpload | null = null
  const file = formData.get('logo')
  if (file instanceof File && file.size > 0) {
    const prepared = prepareUpload(file.name, Buffer.from(await file.arrayBuffer()))
    if (!prepared.ok) errors.logo = prepared.error
    else logo = prepared.value
  }

  if (Object.keys(errors).length > 0 || !parsed.success) {
    return { errors, message: 'Please fix the problems below.' }
  }

  await applyEdit(application.id, parsed.data, logo)
  revalidatePath('/portal/application')
  return { errors: {}, saved: true }
}

export async function withdrawApplication(): Promise<void> {
  const application = await requireApplicant()

  if (application.status === 'withdrawn') redirect('/portal/application')

  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ status: 'withdrawn', withdrawnAt: new Date(), updatedAt: new Date() })
      .where(eq(applications.id, application.id))

    await tx.insert(auditLog).values({
      actorType: 'applicant',
      actorId: application.id,
      applicationId: application.id,
      action: 'application.withdrawn',
      detail: { from: application.status },
    })
  })

  await destroyApplicantSession()
  redirect('/portal?withdrawn=1')
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/integration/portal-edit.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the edit form**

`src/app/portal/application/EditForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { LIMITS } from '@/validation/application'
import { saveApplication, type EditState } from './actions'

const initial: EditState = { errors: {} }

const LONG_FIELDS = [
  { name: 'about', label: 'Tell us about your organization' },
  { name: 'showcase', label: 'What will you showcase at your booth?' },
  { name: 'communityImpact', label: 'How does this advance advocacy and interest attendees?' },
  { name: 'staffingPlan', label: 'How will you keep someone at the booth at all times?' },
] as const

export function EditForm({
  application,
}: {
  application: {
    orgName: string
    contactName: string
    contactEmail: string
    website: string
    about: string
    showcase: string
    communityImpact: string
    staffingPlan: string
    signText: string
  }
}) {
  const [state, action, pending] = useActionState(saveApplication, initial)

  return (
    <form action={action} noValidate encType="multipart/form-data">
      {state.saved && (
        <p id="edit-saved" className="mb-6 rounded bg-green-50 p-4 font-semibold text-green-900">
          Your changes are saved.
        </p>
      )}
      {state.message && (
        <div id="edit-errors" role="alert" className="mb-6 rounded border-l-4 border-red-700 bg-red-50 p-4">
          <p className="font-semibold text-red-800">{state.message}</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
            {Object.entries(state.errors).map(([field, message]) => (
              <li key={field}>{message}</li>
            ))}
          </ul>
        </div>
      )}

      <Field label="Organization name" name="orgName" error={state.errors.orgName}>
        <input id="orgName" name="orgName" defaultValue={application.orgName} required className={inputClass} />
      </Field>

      <Field label="Contact name" name="contactName" error={state.errors.contactName}>
        <input id="contactName" name="contactName" defaultValue={application.contactName} required className={inputClass} />
      </Field>

      <Field label="Contact email" name="contactEmail" error={state.errors.contactEmail}>
        <input id="contactEmail" name="contactEmail" type="email" defaultValue={application.contactEmail} required className={inputClass} />
      </Field>

      <Field label="Website" name="website" error={state.errors.website}>
        <input id="website" name="website" defaultValue={application.website} required className={inputClass} />
      </Field>

      {LONG_FIELDS.map((field) => (
        <Field key={field.name} label={field.label} name={field.name} error={state.errors[field.name]}>
          <textarea
            id={field.name}
            name={field.name}
            rows={6}
            defaultValue={application[field.name]}
            required
            className={inputClass}
          />
        </Field>
      ))}

      <Field label="Booth sign text" name="signText" error={state.errors.signText}>
        <input
          id="signText"
          name="signText"
          maxLength={LIMITS.signTextMax}
          defaultValue={application.signText}
          required
          className={inputClass}
        />
      </Field>

      <Field
        label="Replace logo"
        name="logo"
        hint="Leave empty to keep the logo you already sent."
        error={state.errors.logo}
      >
        <input
          id="logo"
          name="logo"
          type="file"
          accept=".png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf"
          className="block w-full text-base"
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 6: Render editing and withdrawal on the application page**

In `src/app/portal/application/page.tsx`, add these imports:

```tsx
import { EditForm } from './EditForm'
import { withdrawApplication } from './actions'
import { isEditable } from '@/domain/application'
import { windowState } from '@/domain/settings'
import { loadSettings } from '@/lib/settings'
```

Inside the component, after loading `thread`, add:

```tsx
  const settings = await loadSettings()
  const canEdit =
    isEditable(application.status as Status) && windowState(settings, new Date()) === 'open'
```

Then insert this immediately before the closing `</main>`:

```tsx
      {canEdit && (
        <section className="mt-12 border-t border-scale-rule/40 pt-10">
          <h2 className="text-2xl font-bold">Edit your application</h2>
          <p className="mt-2 text-scale-muted">
            You can change your answers until applications close.
          </p>
          <div className="mt-6">
            <EditForm application={application} />
          </div>
        </section>
      )}

      {application.status !== 'withdrawn' && (
        <section className="mt-12 border-t border-scale-rule/40 pt-10">
          <h2 className="text-2xl font-bold">Withdraw</h2>
          <p className="mt-2 text-scale-muted">
            If your plans have changed, withdraw now and we will give the booth to another project.
            Doing this early costs you nothing.
          </p>
          <form action={withdrawApplication} className="mt-4">
            <button
              type="submit"
              className="rounded border border-red-700 px-5 py-3 font-semibold text-red-800 hover:bg-red-50"
            >
              Withdraw this application
            </button>
          </form>
        </section>
      )}
```

- [ ] **Step 7: Write the end-to-end test**

`tests/e2e/portal-edit.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082',
  'hex',
)
const LONG = 'We are a long-running free software project with an active community. '.repeat(3)

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.88' } })

async function applyAndEnter(page: import('@playwright/test').Page, request: import('@playwright/test').APIRequestContext) {
  const email = `maintainer+edit${Date.now()}@example.org`
  await page.goto('/apply')
  await page.getByLabel('Organization name').fill('Debian')
  await page.getByLabel('Contact name').fill('A Maintainer')
  await page.getByLabel('Contact email').fill(email)
  await page.getByLabel('Website').fill('debian.org')
  await page.getByLabel('Tell us about your organization').fill(LONG)
  await page.getByLabel('What will you showcase at your booth?').fill(LONG)
  await page.getByLabel('How does this advance advocacy and interest attendees?').fill(LONG)
  await page.getByLabel('How will you keep someone at the booth at all times?').fill(LONG)
  await page.getByLabel('Booth sign text').fill('The Debian Project')
  await page.getByLabel('Logo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: /submit application/i }).click()
  await expect(page.getByRole('heading', { name: /application received/i })).toBeVisible()

  await request.post('/api/dev/dispatch')

  const search = await fetch(`http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
  const { messages } = (await search.json()) as { messages: Array<{ ID: string }> }
  const detail = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`)
  const { Text } = (await detail.json()) as { Text: string }
  await page.goto(Text.match(/http:\/\/localhost:3000\/portal\/enter\?token=[A-Za-z0-9_-]+/)![0])
}

test('an applicant can correct their answers', async ({ page, request }) => {
  await applyAndEnter(page, request)

  await page.getByLabel('Booth sign text').fill('The Debian Project ')
  await page.getByRole('button', { name: /save changes/i }).click()

  await expect(page.locator('#edit-saved')).toBeVisible()
})

test('an applicant can withdraw', async ({ page, request }) => {
  await applyAndEnter(page, request)

  await page.getByRole('button', { name: /withdraw this application/i }).click()
  await expect(page.getByRole('heading', { name: /your booth application/i })).toBeVisible()
})
```

- [ ] **Step 8: Run the tests**

Run: `npx playwright test tests/e2e/portal-edit.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(portal): edit answers before the deadline and withdraw"
```

---

### Task 6: Admin sign-in, chrome, and the application list

**Files:**
- Create: `src/app/admin/login/page.tsx`, `src/app/admin/login/actions.ts`, `src/app/admin/enter/route.ts`, `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`, `src/app/admin/applications/page.tsx`
- Modify: `src/db/seed.ts` (sample applications across every status)
- Test: `tests/integration/admin-link.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `issueToken`, `consumeToken`, `createAdminSession`, `requireAdmin`, `destroyAdminSession`, `enqueueEmail`, `renderTemplate`, `hit`, `normalizeEmail`, `<StatusBadge>`, `STATUS_LABELS`.
- Produces: from `src/app/admin/login/actions.ts`: `type AdminLoginState = { sent: boolean; error?: string }`; `requestAdminLink(prev: AdminLoginState, formData: FormData): Promise<AdminLoginState>`; `sendAdminLink(email: string): Promise<void>` (exported for testing); `signOut(): Promise<void>`.

- [ ] **Step 1: Write the failing integration test**

`tests/integration/admin-link.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { admins, authTokens, emailOutbox } from '@/db/schema'
import { sendAdminLink } from '@/app/admin/login/actions'

const db = getDb()

beforeEach(async () => {
  await db.delete(emailOutbox)
  await db.delete(authTokens)
})

afterAll(async () => {
  await closeDb()
})

describe('sendAdminLink', () => {
  it('queues a link for the seeded admin', async () => {
    await sendAdminLink('bala@socallinuxexpo.org')

    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].toEmail).toBe('bala@socallinuxexpo.org')
    expect(outbox[0].bodyText).toContain('/admin/enter?token=')
  })

  it('matches the address case-insensitively', async () => {
    await sendAdminLink('Bala@SoCalLinuxExpo.org')
    expect(await db.select().from(emailOutbox)).toHaveLength(1)
  })

  it('queues nothing for an address that is not an admin', async () => {
    await sendAdminLink('stranger@example.org')
    expect(await db.select().from(emailOutbox)).toHaveLength(0)
    expect(await db.select().from(authTokens)).toHaveLength(0)
  })

  it('queues nothing for a deactivated admin', async () => {
    const email = `retired+${Date.now()}@socallinuxexpo.org`
    await db.insert(admins).values({ email, name: 'Retired', isActive: false })

    await sendAdminLink(email)
    expect(await db.select().from(emailOutbox)).toHaveLength(0)

    await db.delete(admins).where(eq(admins.email, email))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/admin-link.test.ts`
Expected: FAIL — cannot resolve `@/app/admin/login/actions`.

- [ ] **Step 3: Write `src/app/admin/login/actions.ts`**

```ts
'use server'

import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { admins, emailTemplates } from '@/db/schema'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { normalizeEmail } from '@/lib/email'
import { hit } from '@/lib/ratelimit'
import { destroyAdminSession } from '@/services/auth/session'
import { issueToken } from '@/services/auth/tokens'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'

export interface AdminLoginState {
  sent: boolean
  error?: string
}

/** Queues an admin sign-in link, but only for an allowlisted, active admin. */
export async function sendAdminLink(rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail)
  const db = getDb()

  const admin = await db.query.admins.findFirst({
    where: and(eq(admins.email, email), eq(admins.isActive, true)),
  })
  if (!admin) return

  await db.transaction(async (tx) => {
    const token = await issueToken(tx, { purpose: 'admin_login', adminId: admin.id })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'magic_link_admin'),
    })
    if (!template) throw new Error('Missing email template: magic_link_admin')

    const rendered = renderTemplate(template, {
      admin_name: admin.name,
      event: EVENT.name,
      contact_email: EVENT.contactEmail,
      admin_url: `${getEnv().PUBLIC_BASE_URL}/admin/enter?token=${token}`,
    })

    await enqueueEmail(tx, {
      to: admin.email,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    })
  })
}

export async function requestAdminLink(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const email = normalizeEmail(String(formData.get('email') ?? ''))
  if (!email.includes('@')) {
    return { sent: false, error: 'Enter your admin email address.' }
  }

  const forwarded = (await headers()).get('x-forwarded-for') ?? 'unknown'
  if (!hit(`admin-link:${email}`, 5, 3_600_000)) return { sent: true }
  if (!hit(`admin-link-ip:${forwarded.split(',')[0]!.trim()}`, 20, 3_600_000)) return { sent: true }

  await sendAdminLink(email)
  // Identical response whether or not the address is an admin.
  return { sent: true }
}

export async function signOut(): Promise<void> {
  await destroyAdminSession()
  redirect('/admin/login')
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run db:seed && npx vitest run tests/integration/admin-link.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the login page and entry route**

`src/app/admin/login/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Button } from '@/components/Button'
import { Field, inputClass } from '@/components/Field'
import { requestAdminLink, type AdminLoginState } from './actions'

const initial: AdminLoginState = { sent: false }

export default function AdminLogin() {
  const [state, action, pending] = useActionState(requestAdminLink, initial)

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-4xl font-bold">Community Booths admin</h1>

      {state.sent ? (
        <div id="admin-sent" className="mt-6 rounded border-l-4 border-scale-blue bg-scale-blue-pale/25 p-4">
          <p className="font-semibold">Check your email.</p>
          <p className="mt-2 text-scale-muted">
            If that address is an admin, we have sent a sign-in link. It works once and expires in
            30 minutes.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-scale-muted">
            Sign in with a link sent to your SCaLE address.
          </p>
          <form action={action} noValidate className="mt-8">
            <Field label="Email address" name="email" error={state.error}>
              <input id="email" name="email" type="email" required className={inputClass} />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending…' : 'Email me a sign-in link'}
            </Button>
          </form>
        </>
      )}
    </main>
  )
}
```

`src/app/admin/enter/route.ts`:

```ts
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb } from '@/db/client'
import { admins } from '@/db/schema'
import { createAdminSession } from '@/services/auth/session'
import { consumeToken } from '@/services/auth/tokens'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) redirect('/admin/login?expired=1')

  const subject = await consumeToken(token, 'admin_login')
  if (!subject?.adminId) redirect('/admin/login?expired=1')

  await getDb()
    .update(admins)
    .set({ lastLoginAt: new Date() })
    .where(eq(admins.id, subject.adminId))

  await createAdminSession(subject.adminId)
  redirect('/admin')
}
```

- [ ] **Step 6: Write the admin chrome and dashboard**

`src/app/admin/layout.tsx`:

```tsx
import Link from 'next/link'
import { getAdminSession } from '@/services/auth/session'
import { signOut } from './login/actions'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The login page and entry route live under /admin and must stay reachable
  // while signed out, so this layout only adds chrome for a signed-in admin.
  // Access itself is enforced by requireAdmin() in each protected page.
  const admin = await getAdminSession()

  if (!admin) return <>{children}</>

  return (
    <div>
      <nav className="border-b border-scale-rule/40 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-6 py-3 text-sm">
          <Link href="/admin" className="font-semibold hover:text-scale-blue">
            Dashboard
          </Link>
          <Link href="/admin/applications" className="font-semibold hover:text-scale-blue">
            Applications
          </Link>
          <span className="ml-auto text-scale-muted" data-testid="admin-identity">
            {admin.name} &middot; {admin.email}
          </span>
          <form action={signOut}>
            <button type="submit" className="font-semibold text-scale-blue hover:underline">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      {children}
    </div>
  )
}
```

`src/app/admin/page.tsx`:

```tsx
import Link from 'next/link'
import { count, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications, emailOutbox, messages } from '@/db/schema'
import { STATUS_LABELS, type Status } from '@/domain/application'
import { loadSettings } from '@/lib/settings'
import { requireAdmin } from '@/services/auth/session'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  await requireAdmin()
  const db = getDb()
  const settings = await loadSettings()

  const byStatus = await db
    .select({ status: applications.status, total: count() })
    .from(applications)
    .groupBy(applications.status)

  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row.total])) as Record<
    Status,
    number | undefined
  >

  const accepted = (counts.accepted ?? 0) + (counts.confirmed ?? 0)
  const awaitingConfirmation = counts.accepted ?? 0

  const [unanswered] = await db
    .select({ total: count() })
    .from(messages)
    .where(sql`${messages.direction} = 'inbound' AND ${messages.readByAdminAt} IS NULL`)

  const [failedMail] = await db
    .select({ total: count() })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, 'failed'))

  const tiles = [
    { label: 'Booths accepted', value: `${accepted} of ${settings.boothCap}` },
    { label: 'Awaiting confirmation', value: awaitingConfirmation },
    { label: 'Unanswered replies', value: unanswered?.total ?? 0 },
    { label: 'Failed emails', value: failedMail?.total ?? 0 },
  ]

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded border border-scale-rule/40 p-5">
            <p className="text-sm uppercase tracking-wide text-scale-muted">{tile.label}</p>
            <p className="mt-2 text-3xl font-bold">{tile.value}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-12 text-2xl font-bold">By status</h2>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(STATUS_LABELS) as Status[]).map((status) => (
          <li key={status}>
            <Link
              href={`/admin/applications?status=${status}`}
              className="flex items-center justify-between rounded border border-scale-rule/40 px-4 py-3 hover:border-scale-blue"
            >
              <span>{STATUS_LABELS[status]}</span>
              <span className="font-bold">{counts[status] ?? 0}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 7: Write the application list**

`src/app/admin/applications/page.tsx`:

```tsx
import Link from 'next/link'
import { and, desc, ilike, or, eq, type SQL } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications } from '@/db/schema'
import { StatusBadge } from '@/components/StatusBadge'
import { STATUS_LABELS, type Status } from '@/domain/application'
import { requireAdmin } from '@/services/auth/session'

export const dynamic = 'force-dynamic'

export default async function ApplicationList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>
}) {
  await requireAdmin()
  const { status, q } = await searchParams

  const filters: SQL[] = []
  if (status && status in STATUS_LABELS) {
    filters.push(eq(applications.status, status as Status))
  }
  if (q) {
    const needle = `%${q}%`
    filters.push(
      or(
        ilike(applications.orgName, needle),
        ilike(applications.contactName, needle),
        ilike(applications.contactEmail, needle),
        ilike(applications.website, needle),
      )!,
    )
  }

  const rows = await getDb()
    .select()
    .from(applications)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(applications.submittedAt))

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold">Applications</h1>

      <form className="mt-6 flex flex-wrap items-end gap-4" method="get">
        <div>
          <label htmlFor="status" className="block text-sm font-semibold">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ''}
            className="mt-1 rounded border border-scale-rule px-3 py-2"
          >
            <option value="">All</option>
            {(Object.keys(STATUS_LABELS) as Status[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="q" className="block text-sm font-semibold">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="org, contact, email, website"
            className="mt-1 w-64 rounded border border-scale-rule px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-scale-blue px-5 py-2 font-semibold text-white hover:bg-scale-blue-hover"
        >
          Filter
        </button>
      </form>

      <p className="mt-6 text-scale-muted" data-testid="result-count">
        {rows.length} application{rows.length === 1 ? '' : 's'}
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-scale-rule/50 text-sm uppercase tracking-wide text-scale-muted">
              <th className="py-2 pr-4 font-semibold">Organization</th>
              <th className="py-2 pr-4 font-semibold">Contact</th>
              <th className="py-2 pr-4 font-semibold">Status</th>
              <th className="py-2 pr-4 font-semibold">Booth</th>
              <th className="py-2 font-semibold">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-scale-rule/20">
                <td className="py-3 pr-4">
                  <Link
                    href={`/admin/applications/${row.id}`}
                    className="font-semibold text-scale-blue underline"
                  >
                    {row.orgName}
                  </Link>
                </td>
                <td className="py-3 pr-4 text-scale-muted">{row.contactEmail}</td>
                <td className="py-3 pr-4">
                  <StatusBadge status={row.status as Status} />
                </td>
                <td className="py-3 pr-4">{row.boothNumber ?? '—'}</td>
                <td className="py-3 text-scale-muted">
                  {row.submittedAt.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-8 text-scale-muted">No applications match that filter.</p>
      )}
    </main>
  )
}
```

- [ ] **Step 8: Seed sample applications for the demo**

Add to `src/db/seed.ts`, before the closing `await closeDb()`, and add `applications` to the schema import:

```ts
  const SAMPLES = [
    ['Debian', 'debian.org', 'submitted'],
    ['PostgreSQL', 'postgresql.org', 'under_review'],
    ['Electronic Frontier Foundation', 'eff.org', 'accepted'],
    ['Wikimedia LA', 'wikimedia.org', 'confirmed'],
    ['Home Assistant', 'home-assistant.io', 'waitlisted'],
    ['KDE', 'kde.org', 'info_requested'],
    ['A Very Small Project', 'example.org', 'rejected'],
  ] as const

  const filler = (word: string) =>
    `${word} `.repeat(30).trim().slice(0, 400)

  for (const [orgName, domain, status] of SAMPLES) {
    const contactEmail = `contact@${domain}`
    const existing = await db.query.applications.findFirst({
      where: eq(applications.contactEmail, contactEmail),
    })
    if (existing) {
      // Reset the demo fixture: the decision tests move these statuses, and
      // re-seeding must put them back or the suite only passes once.
      await db
        .update(applications)
        .set({
          status,
          boothNumber: status === 'confirmed' ? '412' : null,
          decidedAt: null,
          decidedBy: null,
          confirmedAt: status === 'confirmed' ? new Date() : null,
          confirmedByName: status === 'confirmed' ? `${orgName} booth lead` : null,
        })
        .where(eq(applications.id, existing.id))
      continue
    }

    await db.insert(applications).values({
      orgName,
      contactName: `${orgName} booth lead`,
      contactEmail,
      website: `https://${domain}`,
      about: filler(`${orgName} is a long-running free software community.`),
      showcase: filler('We will run live demos and answer questions at the booth.'),
      communityImpact: filler('Attendees meet maintainers and learn how to contribute.'),
      staffingPlan: filler('Four volunteers rotating in two-hour shifts across all three days.'),
      signText: orgName.slice(0, 60),
      status,
      boothNumber: status === 'confirmed' ? '412' : null,
      ...(status === 'confirmed'
        ? {
            confirmedAt: new Date(),
            confirmedByName: `${orgName} booth lead`,
            confirmedTermsSnapshot: DEFAULT_TERMS_TEXT,
            confirmedTermsVersion: 1,
          }
        : {}),
    })
  }
```

Add `import { eq } from 'drizzle-orm'` at the top of the file.

- [ ] **Step 9: Write the end-to-end test**

`tests/e2e/admin.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.99' } })

async function signInAsBala(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
) {
  await page.goto('/admin/login')
  await page.getByLabel('Email address').fill('bala@socallinuxexpo.org')
  await page.getByRole('button', { name: /email me a sign-in link/i }).click()
  await expect(page.locator('#admin-sent')).toBeVisible()

  await request.post('/api/dev/dispatch')

  const search = await fetch(
    `http://localhost:8025/api/v1/search?query=${encodeURIComponent('to:bala@socallinuxexpo.org')}`,
  )
  const { messages } = (await search.json()) as { messages: Array<{ ID: string }> }
  const detail = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`)
  const { Text } = (await detail.json()) as { Text: string }
  await page.goto(Text.match(/http:\/\/localhost:3000\/admin\/enter\?token=[A-Za-z0-9_-]+/)![0])
}

test('the admin console is closed to anonymous visitors', async ({ page }) => {
  await page.goto('/admin/applications')
  await expect(page.getByRole('heading', { name: /community booths admin/i })).toBeVisible()
})

test('a stranger gets the same answer as a real admin', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('Email address').fill('stranger@example.org')
  await page.getByRole('button', { name: /email me a sign-in link/i }).click()
  await expect(page.locator('#admin-sent')).toContainText('If that address is an admin')
})

test('bala can sign in and see the application list', async ({ page, request }) => {
  await signInAsBala(page, request)

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByTestId('admin-identity')).toContainText('bala@socallinuxexpo.org')

  await page.getByRole('link', { name: 'Applications' }).click()
  await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'PostgreSQL' })).toBeVisible()
})

test('the list filters by status', async ({ page, request }) => {
  await signInAsBala(page, request)
  await page.goto('/admin/applications?status=confirmed')

  await expect(page.getByRole('link', { name: 'Wikimedia LA' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'PostgreSQL' })).toHaveCount(0)
})
```

- [ ] **Step 10: Run the tests**

Run: `npm run db:seed && npx playwright test tests/e2e/admin.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(admin): magic-link sign-in, dashboard, and the application list"
```

---

### Task 7: Admin application detail and internal notes

**Files:**
- Create: `src/app/admin/applications/[id]/page.tsx`, `src/app/admin/applications/[id]/NoteForm.tsx`, `src/app/admin/applications/[id]/actions.ts`
- Test: `tests/integration/admin-notes.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `<StatusBadge>`, `<Prose>`, `internalNotes`, `messages`, `auditLog`.
- Produces: from `src/app/admin/applications/[id]/actions.ts`: `type NoteState = { error?: string; saved?: boolean }`; `addNote(applicationId: string, prev: NoteState, formData: FormData): Promise<NoteState>`; `assignBoothNumber(applicationId: string, formData: FormData): Promise<void>`; `writeNote(applicationId: string, adminId: string, body: string): Promise<void>` (exported for testing).

- [ ] **Step 1: Write the failing test**

`tests/integration/admin-notes.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { admins, applications, internalNotes, messages } from '@/db/schema'
import { writeNote } from '@/app/admin/applications/[id]/actions'

const db = getDb()

beforeEach(async () => {
  await db.delete(applications)
})

afterAll(async () => {
  await closeDb()
})

async function fixture() {
  const [application] = await db
    .insert(applications)
    .values({
      orgName: 'Debian',
      contactName: 'A Maintainer',
      contactEmail: `maintainer+${Date.now()}@example.org`,
      website: 'https://www.debian.org',
      about: 'a'.repeat(120),
      showcase: 'b'.repeat(120),
      communityImpact: 'c'.repeat(120),
      staffingPlan: 'd'.repeat(120),
      signText: 'Debian',
    })
    .returning()

  const admin = await db.query.admins.findFirst({
    where: eq(admins.email, 'bala@socallinuxexpo.org'),
  })
  if (!admin) throw new Error('Run `npm run db:seed` first.')

  return { application, admin }
}

describe('writeNote', () => {
  it('stores the note against the application and its author', async () => {
    const { application, admin } = await fixture()
    await writeNote(application.id, admin.id, 'Strong application, good demo plan.')

    const notes = await db
      .select()
      .from(internalNotes)
      .where(eq(internalNotes.applicationId, application.id))

    expect(notes).toHaveLength(1)
    expect(notes[0].body).toBe('Strong application, good demo plan.')
    expect(notes[0].adminId).toBe(admin.id)
  })

  it('never lands in the applicant-visible message thread', async () => {
    const { application, admin } = await fixture()
    await writeNote(application.id, admin.id, 'Internal only: they were late last year.')

    const thread = await db
      .select()
      .from(messages)
      .where(eq(messages.applicationId, application.id))

    expect(thread).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/admin-notes.test.ts`
Expected: FAIL — cannot resolve the actions module.

- [ ] **Step 3: Write `src/app/admin/applications/[id]/actions.ts`**

```ts
'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/db/client'
import { applications, auditLog, internalNotes } from '@/db/schema'
import { requireAdmin } from '@/services/auth/session'

export interface NoteState {
  error?: string
  saved?: boolean
}

export async function writeNote(
  applicationId: string,
  adminId: string,
  body: string,
): Promise<void> {
  await getDb().insert(internalNotes).values({ applicationId, adminId, body })
}

export async function addNote(
  applicationId: string,
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  const admin = await requireAdmin()
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { error: 'Write something first.' }

  await writeNote(applicationId, admin.id, body)
  revalidatePath(`/admin/applications/${applicationId}`)
  return { saved: true }
}

export async function assignBoothNumber(
  applicationId: string,
  formData: FormData,
): Promise<void> {
  const admin = await requireAdmin()
  const raw = String(formData.get('boothNumber') ?? '').trim()
  const boothNumber = raw === '' ? null : raw.slice(0, 20)

  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .update(applications)
      .set({ boothNumber, updatedAt: new Date() })
      .where(eq(applications.id, applicationId))

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: admin.id,
      applicationId,
      action: 'booth.assigned',
      detail: { boothNumber },
    })
  })

  revalidatePath(`/admin/applications/${applicationId}`)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run db:seed && npx vitest run tests/integration/admin-notes.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Write the note form**

`src/app/admin/applications/[id]/NoteForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { addNote, type NoteState } from './actions'

const initial: NoteState = {}

export function NoteForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState(
    addNote.bind(null, applicationId),
    initial,
  )

  return (
    <form action={action} className="mt-4">
      <label htmlFor="body" className="block text-sm font-semibold">
        Add an internal note
      </label>
      <p className="mt-1 text-sm text-scale-muted">
        Only admins can see these. The applicant never does.
      </p>
      <textarea
        id="body"
        name="body"
        rows={3}
        className="mt-2 w-full rounded border border-scale-rule px-3 py-2"
      />
      {state.error && <p className="mt-2 text-sm font-medium text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded bg-scale-blue px-4 py-2 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Add note'}
      </button>
    </form>
  )
}
```

- [ ] **Step 6: Write the detail page**

`src/app/admin/applications/[id]/page.tsx`:

```tsx
import { asc, desc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getDb } from '@/db/client'
import { admins, applications, auditLog, internalNotes, messages } from '@/db/schema'
import { Prose } from '@/components/Prose'
import { StatusBadge } from '@/components/StatusBadge'
import { type Status } from '@/domain/application'
import { requireAdmin } from '@/services/auth/session'
import { NoteForm } from './NoteForm'
import { assignBoothNumber } from './actions'

export const dynamic = 'force-dynamic'

const ANSWERS = [
  ['About the organization', 'about'],
  ['What they will showcase', 'showcase'],
  ['How it advances advocacy', 'communityImpact'],
  ['Staffing plan', 'staffingPlan'],
] as const

export default async function ApplicationDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params
  const db = getDb()

  const application = await db.query.applications.findFirst({ where: eq(applications.id, id) })
  if (!application) notFound()

  const notes = await db
    .select({
      id: internalNotes.id,
      body: internalNotes.body,
      createdAt: internalNotes.createdAt,
      authorName: admins.name,
    })
    .from(internalNotes)
    .leftJoin(admins, eq(internalNotes.adminId, admins.id))
    .where(eq(internalNotes.applicationId, id))
    .orderBy(desc(internalNotes.createdAt))

  const thread = await db.query.messages.findMany({
    where: eq(messages.applicationId, id),
    orderBy: [asc(messages.createdAt)],
  })

  const trail = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.applicationId, id))
    .orderBy(desc(auditLog.createdAt))
    .limit(25)

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{application.orgName}</h1>
        <StatusBadge status={application.status as Status} />
      </div>
      <p className="mt-2 text-scale-muted">
        {application.contactName} &middot;{' '}
        <a className="text-scale-blue underline" href={`mailto:${application.contactEmail}`}>
          {application.contactEmail}
        </a>{' '}
        &middot;{' '}
        <a className="text-scale-blue underline" href={application.website}>
          {application.website}
        </a>
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <section>
            <h2 className="text-xl font-bold">Booth sign</h2>
            <p className="mt-2 rounded border border-scale-rule/40 bg-scale-ink px-6 py-4 text-center text-2xl font-bold text-white">
              {application.signText}
            </p>
            {application.logoUploadId && (
              <img
                src={`/logo/${application.logoUploadId}`}
                alt={`${application.orgName} logo`}
                className="mt-4 max-h-40 rounded border border-scale-rule/40 bg-white p-3"
              />
            )}
          </section>

          <section className="mt-10 space-y-8">
            {ANSWERS.map(([label, field]) => (
              <div key={field}>
                <h2 className="text-xl font-bold">{label}</h2>
                <div className="mt-2">
                  <Prose text={application[field]} />
                </div>
              </div>
            ))}
          </section>

          <section className="mt-12">
            <h2 className="text-xl font-bold">Messages with the applicant</h2>
            {thread.length === 0 ? (
              <p className="mt-2 text-scale-muted">Nothing sent yet.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {thread.map((message) => (
                  <li key={message.id} className="rounded border border-scale-rule/40 p-4">
                    <p className="text-sm font-semibold text-scale-muted">
                      {message.direction === 'outbound' ? 'SCaLE → applicant' : 'Applicant → SCaLE'}{' '}
                      &middot; {message.createdAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}
                    </p>
                    <p className="mt-1 font-semibold">{message.subject}</p>
                    <div className="mt-2">
                      <Prose text={message.body} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside>
          <section className="rounded border border-scale-rule/40 p-5">
            <h2 className="text-xl font-bold">Booth number</h2>
            <form action={assignBoothNumber.bind(null, application.id)} className="mt-3 flex gap-2">
              <input
                name="boothNumber"
                defaultValue={application.boothNumber ?? ''}
                placeholder="e.g. 412"
                className="w-full rounded border border-scale-rule px-3 py-2"
              />
              <button
                type="submit"
                className="rounded bg-scale-blue px-4 py-2 font-semibold text-white hover:bg-scale-blue-hover"
              >
                Save
              </button>
            </form>
          </section>

          <section className="mt-6 rounded border border-scale-gold bg-scale-gold-pale/20 p-5">
            <h2 className="text-xl font-bold">Internal notes</h2>
            <NoteForm applicationId={application.id} />
            <ul className="mt-6 space-y-4">
              {notes.map((note) => (
                <li key={note.id} className="border-t border-scale-rule/30 pt-3">
                  <p className="text-sm font-semibold text-scale-muted">
                    {note.authorName ?? 'Unknown'} &middot;{' '}
                    {note.createdAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}
                  </p>
                  <div className="mt-1">
                    <Prose text={note.body} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-6 rounded border border-scale-rule/40 p-5">
            <h2 className="text-xl font-bold">History</h2>
            <ul className="mt-3 space-y-2 text-sm text-scale-muted">
              {trail.map((entry) => (
                <li key={entry.id}>
                  <span className="font-semibold">{entry.action}</span> &middot;{' '}
                  {entry.createdAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}
                </li>
              ))}
              {trail.length === 0 && <li>Nothing recorded yet.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </main>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin): application detail, booth numbers, and internal notes"
```

---

### Task 8: Decisions with a composed email

**Files:**
- Create: `src/app/admin/applications/[id]/DecisionPanel.tsx`
- Modify: `src/domain/application.ts` (add `transitionApplication`), `src/app/admin/applications/[id]/actions.ts` (add `decide`), `src/app/admin/applications/[id]/page.tsx` (render the panel)
- Test: `tests/integration/decisions.test.ts`, `tests/e2e/decide.spec.ts`

**Interfaces:**
- Consumes: `assertTransition`, `DECISION_TEMPLATE_KEYS`, `enqueueEmail`, `renderTemplate`, `formatFee`, `loadSettings`.
- Produces: from `src/domain/application.ts`: `transitionApplication(input: { applicationId: string; to: Status; adminId: string; subject?: string; body?: string; sendEmail: boolean }): Promise<void>`. From the actions module: `type DecisionState = { error?: string; done?: boolean }`; `decide(applicationId: string, prev: DecisionState, formData: FormData): Promise<DecisionState>`; `defaultDecisionEmail(applicationId: string, to: Status): Promise<{ subject: string; body: string } | null>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/decisions.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { admins, applications, auditLog, emailOutbox, messages } from '@/db/schema'
import { transitionApplication } from '@/domain/application'

const db = getDb()

beforeEach(async () => {
  await db.delete(emailOutbox)
  await db.delete(applications)
})

afterAll(async () => {
  await closeDb()
})

async function fixture() {
  const [application] = await db
    .insert(applications)
    .values({
      orgName: 'Debian',
      contactName: 'A Maintainer',
      contactEmail: `maintainer+${Date.now()}@example.org`,
      website: 'https://www.debian.org',
      about: 'a'.repeat(120),
      showcase: 'b'.repeat(120),
      communityImpact: 'c'.repeat(120),
      staffingPlan: 'd'.repeat(120),
      signText: 'Debian',
    })
    .returning()

  const admin = await db.query.admins.findFirst({
    where: eq(admins.email, 'bala@socallinuxexpo.org'),
  })
  if (!admin) throw new Error('Run `npm run db:seed` first.')

  return { application, admin }
}

describe('transitionApplication', () => {
  it('moves the status and records who decided', async () => {
    const { application, admin } = await fixture()
    await transitionApplication({
      applicationId: application.id,
      to: 'accepted',
      adminId: admin.id,
      subject: 'You have a booth',
      body: 'Congratulations.',
      sendEmail: true,
    })

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('accepted')
    expect(after?.decidedBy).toBe(admin.id)
    expect(after?.decidedAt).toBeInstanceOf(Date)
  })

  it('queues the email and records it in the thread', async () => {
    const { application, admin } = await fixture()
    await transitionApplication({
      applicationId: application.id,
      to: 'accepted',
      adminId: admin.id,
      subject: 'You have a booth',
      body: 'Congratulations.',
      sendEmail: true,
    })

    const outbox = await db.select().from(emailOutbox)
    expect(outbox).toHaveLength(1)
    expect(outbox[0].subject).toBe('You have a booth')
    expect(outbox[0].toEmail).toBe(application.contactEmail)

    const thread = await db.select().from(messages).where(eq(messages.applicationId, application.id))
    expect(thread).toHaveLength(1)
    expect(thread[0].direction).toBe('outbound')
    expect(thread[0].emailOutboxId).toBe(outbox[0].id)
  })

  it('can change status without sending anything', async () => {
    const { application, admin } = await fixture()
    await transitionApplication({
      applicationId: application.id,
      to: 'under_review',
      adminId: admin.id,
      sendEmail: false,
    })

    expect(await db.select().from(emailOutbox)).toHaveLength(0)
    expect(await db.select().from(messages)).toHaveLength(0)

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('under_review')
  })

  it('writes an audit row naming both states', async () => {
    const { application, admin } = await fixture()
    await transitionApplication({
      applicationId: application.id,
      to: 'waitlisted',
      adminId: admin.id,
      sendEmail: false,
    })

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.applicationId, application.id))
    expect(entry.action).toBe('status.changed')
    expect(entry.detail).toMatchObject({ from: 'submitted', to: 'waitlisted' })
    expect(entry.actorId).toBe(admin.id)
  })

  it('refuses an illegal transition', async () => {
    const { application, admin } = await fixture()
    await db.update(applications).set({ status: 'rejected' }).where(eq(applications.id, application.id))

    await expect(
      transitionApplication({
        applicationId: application.id,
        to: 'accepted',
        adminId: admin.id,
        sendEmail: false,
      }),
    ).rejects.toThrow(/rejected.*accepted/)
  })

  it('leaves the status untouched when the email cannot be queued', async () => {
    const { application, admin } = await fixture()

    await expect(
      transitionApplication({
        applicationId: application.id,
        to: 'accepted',
        adminId: admin.id,
        subject: '',
        body: '',
        sendEmail: true,
      }),
    ).rejects.toThrow()

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('submitted')
    expect(await db.select().from(emailOutbox)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/decisions.test.ts`
Expected: FAIL — `transitionApplication` is not exported.

- [ ] **Step 3: Add `transitionApplication` to `src/domain/application.ts`**

Append to that file, adding the imports it needs at the top:

```ts
import { eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { applications, auditLog, messages } from '@/db/schema'
import { enqueueEmail } from '@/services/mail/outbox'

export interface TransitionInput {
  applicationId: string
  to: Status
  adminId: string
  subject?: string
  body?: string
  sendEmail: boolean
}

/**
 * The single place an application's status changes. Status, audit row, thread
 * entry and queued email all commit together, so an applicant can never be
 * accepted without the email that tells them so.
 */
export async function transitionApplication(input: TransitionInput): Promise<void> {
  const db = getDb()

  await db.transaction(async (tx) => {
    const application = await tx.query.applications.findFirst({
      where: eq(applications.id, input.applicationId),
    })
    if (!application) throw new Error('No such application.')

    const from = application.status as Status
    assertTransition(from, input.to)

    await tx
      .update(applications)
      .set({
        status: input.to,
        decidedAt: new Date(),
        decidedBy: input.adminId,
        updatedAt: new Date(),
        ...(input.to === 'withdrawn' ? { withdrawnAt: new Date() } : {}),
      })
      .where(eq(applications.id, input.applicationId))

    await tx.insert(auditLog).values({
      actorType: 'admin',
      actorId: input.adminId,
      applicationId: input.applicationId,
      action: 'status.changed',
      detail: { from, to: input.to, emailed: input.sendEmail },
    })

    if (!input.sendEmail) return

    const subject = input.subject?.trim()
    const body = input.body?.trim()
    if (!subject || !body) {
      throw new Error('An email needs both a subject and a body.')
    }

    const [message] = await tx
      .insert(messages)
      .values({
        applicationId: input.applicationId,
        direction: 'outbound',
        authorAdminId: input.adminId,
        subject,
        body,
      })
      .returning({ id: messages.id })

    const outboxId = await enqueueEmail(tx, {
      to: application.contactEmail,
      subject,
      text: body,
      html: body
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
        .join('\n'),
      messageId: message.id,
    })

    await tx
      .update(messages)
      .set({ emailOutboxId: outboxId })
      .where(eq(messages.id, message.id))
  })
}
```

Note: `enqueueEmail` escapes nothing, and the body here is admin-authored, not applicant-authored, so the HTML is built from the admin's own text on purpose.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run db:seed && npx vitest run tests/integration/decisions.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add `decide` and `defaultDecisionEmail` to the admin actions**

Append to `src/app/admin/applications/[id]/actions.ts`:

```ts
import { desc } from 'drizzle-orm'
import { emailTemplates } from '@/db/schema'
import { DECISION_TEMPLATE_KEYS, transitionApplication, type Status } from '@/domain/application'
import { formatFee } from '@/domain/settings'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { loadSettings } from '@/lib/settings'
import { renderTemplate } from '@/services/mail/render'

export interface DecisionState {
  error?: string
  done?: boolean
}

/** The pre-filled email for a decision, or null when that move sends nothing. */
export async function defaultDecisionEmail(
  applicationId: string,
  to: Status,
): Promise<{ subject: string; body: string } | null> {
  const key = DECISION_TEMPLATE_KEYS[to]
  if (!key) return null

  const db = getDb()
  const application = await db.query.applications.findFirst({
    where: eq(applications.id, applicationId),
  })
  if (!application) return null

  const template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.key, key),
  })
  if (!template) return null

  const settings = await loadSettings()
  const rendered = renderTemplate(template, {
    contact_name: application.contactName,
    org_name: application.orgName,
    event: EVENT.name,
    contact_email: EVENT.contactEmail,
    fee: formatFee(settings.lateCancellationFeeCents),
    portal_url: `${getEnv().PUBLIC_BASE_URL}/portal`,
  })

  return { subject: rendered.subject, body: rendered.text }
}

export async function decide(
  applicationId: string,
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const admin = await requireAdmin()
  const to = String(formData.get('status') ?? '') as Status
  const sendEmail = formData.get('sendEmail') === 'on'

  try {
    await transitionApplication({
      applicationId,
      to,
      adminId: admin.id,
      subject: String(formData.get('subject') ?? ''),
      body: String(formData.get('body') ?? ''),
      sendEmail,
    })
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That change was refused.' }
  }

  revalidatePath(`/admin/applications/${applicationId}`)
  return { done: true }
}
```

- [ ] **Step 6: Write the decision panel**

`src/app/admin/applications/[id]/DecisionPanel.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { STATUS_LABELS, type Status } from '@/domain/application'
import { decide, type DecisionState } from './actions'

const initial: DecisionState = {}

export function DecisionPanel({
  applicationId,
  current,
  allowed,
  drafts,
}: {
  applicationId: string
  current: Status
  allowed: Status[]
  drafts: Partial<Record<Status, { subject: string; body: string }>>
}) {
  const [state, action, pending] = useActionState(decide.bind(null, applicationId), initial)
  const [target, setTarget] = useState<Status | ''>('')
  const draft = target ? drafts[target] : undefined

  return (
    <form action={action} className="rounded border border-scale-rule/40 p-5">
      <h2 className="text-xl font-bold">Decision</h2>
      <p className="mt-1 text-sm text-scale-muted">
        Currently {STATUS_LABELS[current]}.
      </p>

      {state.error && (
        <p id="decision-error" role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm font-medium text-red-800">
          {state.error}
        </p>
      )}
      {state.done && (
        <p id="decision-done" className="mt-3 rounded bg-green-50 p-3 text-sm font-medium text-green-900">
          Saved.
        </p>
      )}

      {allowed.length === 0 ? (
        <p className="mt-3 text-scale-muted">This application is in a final state.</p>
      ) : (
        <>
          <label htmlFor="status" className="mt-4 block text-sm font-semibold">
            Move to
          </label>
          <select
            id="status"
            name="status"
            required
            value={target}
            onChange={(event) => setTarget(event.target.value as Status)}
            className="mt-1 w-full rounded border border-scale-rule px-3 py-2"
          >
            <option value="">Choose…</option>
            {allowed.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          {draft && (
            <div className="mt-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="sendEmail" defaultChecked />
                Email the applicant
              </label>

              <label htmlFor="subject" className="mt-3 block text-sm font-semibold">
                Subject
              </label>
              <input
                id="subject"
                name="subject"
                key={`${target}-subject`}
                defaultValue={draft.subject}
                className="mt-1 w-full rounded border border-scale-rule px-3 py-2"
              />

              <label htmlFor="body" className="mt-3 block text-sm font-semibold">
                Message
              </label>
              <textarea
                id="body"
                name="body"
                key={`${target}-body`}
                rows={14}
                defaultValue={draft.body}
                className="mt-1 w-full rounded border border-scale-rule px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-sm text-scale-muted">
                Edit freely before sending. This exact text goes to the applicant and onto the
                thread.
              </p>
            </div>
          )}

          {target && !draft && (
            <p className="mt-3 text-sm text-scale-muted">
              This is an internal move — no email is sent.
            </p>
          )}

          <button
            type="submit"
            disabled={pending || !target}
            className="mt-4 rounded bg-scale-blue px-5 py-3 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Apply decision'}
          </button>
        </>
      )}
    </form>
  )
}
```

- [ ] **Step 7: Render the panel on the detail page**

In `src/app/admin/applications/[id]/page.tsx`, add the imports:

```tsx
import { TRANSITIONS } from '@/domain/application'
import { DecisionPanel } from './DecisionPanel'
import { defaultDecisionEmail } from './actions'
```

After loading `trail`, add:

```tsx
  const allowed = [...TRANSITIONS[application.status as Status]]
  const drafts: Partial<Record<Status, { subject: string; body: string }>> = {}
  for (const status of allowed) {
    const draft = await defaultDecisionEmail(application.id, status)
    if (draft) drafts[status] = draft
  }
```

Then insert as the first child of the `<aside>`, before the booth-number section:

```tsx
          <DecisionPanel
            applicationId={application.id}
            current={application.status as Status}
            allowed={allowed}
            drafts={drafts}
          />
```

- [ ] **Step 8: Write the end-to-end test**

`tests/e2e/decide.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.120' } })

async function signInAsBala(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
) {
  await page.goto('/admin/login')
  await page.getByLabel('Email address').fill('bala@socallinuxexpo.org')
  await page.getByRole('button', { name: /email me a sign-in link/i }).click()
  await request.post('/api/dev/dispatch')

  const search = await fetch(
    `http://localhost:8025/api/v1/search?query=${encodeURIComponent('to:bala@socallinuxexpo.org')}`,
  )
  const { messages } = (await search.json()) as { messages: Array<{ ID: string }> }
  const detail = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`)
  const { Text } = (await detail.json()) as { Text: string }
  await page.goto(Text.match(/http:\/\/localhost:3000\/admin\/enter\?token=[A-Za-z0-9_-]+/)![0])
}

test('an admin accepts an application and the email is queued', async ({ page, request }) => {
  await signInAsBala(page, request)

  await page.goto('/admin/applications?status=submitted')
  await page.getByRole('link', { name: 'Debian' }).first().click()

  await expect(page.getByRole('heading', { name: 'Debian' })).toBeVisible()

  await page.getByLabel('Move to').selectOption('accepted')
  await expect(page.getByLabel('Subject')).toHaveValue(/community booth/i)
  await expect(page.getByLabel('Message')).toContainText('$1,000')

  await page.getByRole('button', { name: /apply decision/i }).click()
  await expect(page.locator('#decision-done')).toBeVisible()
  await expect(page.getByText('Accepted').first()).toBeVisible()
})

test('an internal move offers no email', async ({ page, request }) => {
  await signInAsBala(page, request)

  await page.goto('/admin/applications?status=under_review')
  await page.getByRole('link', { name: 'PostgreSQL' }).click()

  await page.getByLabel('Move to').selectOption('waitlisted')
  await expect(page.getByLabel('Subject')).toBeVisible()

  await page.getByLabel('Move to').selectOption('submitted')
  await expect(page.getByText('This is an internal move')).toBeVisible()
})
```

- [ ] **Step 9: Run the tests**

Run: `npm run db:seed && npx playwright test tests/e2e/decide.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(admin): decisions with a templated, editable email"
```

---

### Task 9: Confirm booth, terms snapshot, and applicant replies

**Files:**
- Create: `src/app/portal/application/ConfirmPanel.tsx`, `src/app/portal/application/ReplyForm.tsx`
- Modify: `src/app/portal/application/actions.ts` (add `confirmBooth`, `postReply`), `src/app/portal/application/page.tsx` (render both)
- Test: `tests/integration/confirm.test.ts`, `tests/e2e/confirm.spec.ts`

**Interfaces:**
- Consumes: `requireApplicant`, `loadSettings`, `formatFee`, `enqueueEmail`, `renderTemplate`, `admins`, `messages`.
- Produces: from `src/app/portal/application/actions.ts`: `type ConfirmState = { error?: string; confirmed?: boolean }`; `confirmBooth(prev: ConfirmState, formData: FormData): Promise<ConfirmState>`; `recordConfirmation(applicationId: string, name: string): Promise<void>` (exported for testing); `type ReplyState = { error?: string; sent?: boolean }`; `postReply(prev: ReplyState, formData: FormData): Promise<ReplyState>`.

- [ ] **Step 1: Write the failing test**

`tests/integration/confirm.test.ts`:

```ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { applications, auditLog, settings } from '@/db/schema'
import { recordConfirmation } from '@/app/portal/application/actions'

const db = getDb()

beforeEach(async () => {
  await db.delete(applications)
})

afterAll(async () => {
  await closeDb()
})

async function anAcceptedApplication() {
  const [row] = await db
    .insert(applications)
    .values({
      orgName: 'Debian',
      contactName: 'A Maintainer',
      contactEmail: `maintainer+${Date.now()}@example.org`,
      website: 'https://www.debian.org',
      about: 'a'.repeat(120),
      showcase: 'b'.repeat(120),
      communityImpact: 'c'.repeat(120),
      staffingPlan: 'd'.repeat(120),
      signText: 'Debian',
      status: 'accepted',
    })
    .returning()
  return row
}

describe('recordConfirmation', () => {
  it('moves the application to confirmed', async () => {
    const application = await anAcceptedApplication()
    await recordConfirmation(application.id, 'A Maintainer')

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.status).toBe('confirmed')
    expect(after?.confirmedAt).toBeInstanceOf(Date)
    expect(after?.confirmedByName).toBe('A Maintainer')
  })

  it('freezes the exact terms text that was agreed to', async () => {
    const application = await anAcceptedApplication()
    const current = await db.query.settings.findFirst({ where: eq(settings.id, 1) })

    await recordConfirmation(application.id, 'A Maintainer')

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.confirmedTermsSnapshot).toBe(current!.termsText)
    expect(after?.confirmedTermsVersion).toBe(current!.termsVersion)
  })

  it('keeps the snapshot even after the terms are later rewritten', async () => {
    const application = await anAcceptedApplication()
    const before = await db.query.settings.findFirst({ where: eq(settings.id, 1) })

    await recordConfirmation(application.id, 'A Maintainer')

    await db
      .update(settings)
      .set({ termsText: 'Completely different terms.', termsVersion: 99 })
      .where(eq(settings.id, 1))

    const after = await db.query.applications.findFirst({ where: eq(applications.id, application.id) })
    expect(after?.confirmedTermsSnapshot).toBe(before!.termsText)
    expect(after?.confirmedTermsSnapshot).not.toContain('Completely different')

    // Restore for other tests.
    await db
      .update(settings)
      .set({ termsText: before!.termsText, termsVersion: before!.termsVersion })
      .where(eq(settings.id, 1))
  })

  it('records the confirmation in the audit log', async () => {
    const application = await anAcceptedApplication()
    await recordConfirmation(application.id, 'A Maintainer')

    const [entry] = await db.select().from(auditLog).where(eq(auditLog.applicationId, application.id))
    expect(entry.action).toBe('booth.confirmed')
    expect(entry.actorType).toBe('applicant')
    expect(entry.detail).toMatchObject({ confirmedByName: 'A Maintainer' })
  })

  it('refuses to confirm an application that was not accepted', async () => {
    const application = await anAcceptedApplication()
    await db.update(applications).set({ status: 'submitted' }).where(eq(applications.id, application.id))

    await expect(recordConfirmation(application.id, 'A Maintainer')).rejects.toThrow(
      /submitted.*confirmed/,
    )
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/integration/confirm.test.ts`
Expected: FAIL — `recordConfirmation` is not exported.

- [ ] **Step 3: Add `recordConfirmation`, `confirmBooth` and `postReply` to the portal actions**

Append to `src/app/portal/application/actions.ts`, adding the imports at the top:

```ts
import { admins, emailTemplates, messages, settings } from '@/db/schema'
import { assertTransition, type Status as AppStatus } from '@/domain/application'
import { getEnv } from '@/env'
import { EVENT } from '@/event'
import { enqueueEmail } from '@/services/mail/outbox'
import { renderTemplate } from '@/services/mail/render'

export interface ConfirmState {
  error?: string
  confirmed?: boolean
}

export interface ReplyState {
  error?: string
  sent?: boolean
}

/**
 * Records acceptance of the booth together with a frozen copy of the exact
 * terms text shown. A later edit to the terms must never rewrite what somebody
 * already agreed to.
 */
export async function recordConfirmation(applicationId: string, name: string): Promise<void> {
  const db = getDb()

  await db.transaction(async (tx) => {
    const application = await tx.query.applications.findFirst({
      where: eq(applications.id, applicationId),
    })
    if (!application) throw new Error('No such application.')

    assertTransition(application.status as AppStatus, 'confirmed')

    const current = await tx.query.settings.findFirst({ where: eq(settings.id, 1) })
    if (!current) throw new Error('Settings row is missing.')

    await tx
      .update(applications)
      .set({
        status: 'confirmed',
        confirmedAt: new Date(),
        confirmedByName: name,
        confirmedTermsSnapshot: current.termsText,
        confirmedTermsVersion: current.termsVersion,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId))

    await tx.insert(auditLog).values({
      actorType: 'applicant',
      actorId: applicationId,
      applicationId,
      action: 'booth.confirmed',
      detail: { confirmedByName: name, termsVersion: current.termsVersion },
    })
  })
}

export async function confirmBooth(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const application = await requireApplicant()
  const name = String(formData.get('confirmedByName') ?? '').trim()

  if (name.length < 2) {
    return { error: 'Type your full name to confirm.' }
  }
  if (formData.get('agree') !== 'on') {
    return { error: 'Tick the box to agree to the booth terms.' }
  }

  try {
    await recordConfirmation(application.id, name)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'That could not be confirmed.' }
  }

  revalidatePath('/portal/application')
  return { confirmed: true }
}

export async function postReply(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const application = await requireApplicant()
  const body = String(formData.get('body') ?? '').trim()
  if (body.length < 2) return { error: 'Write your reply first.' }

  const db = getDb()
  await db.transaction(async (tx) => {
    await tx.insert(messages).values({
      applicationId: application.id,
      direction: 'inbound',
      subject: `Re: ${application.orgName} community booth`,
      body,
    })

    const template = await tx.query.emailTemplates.findFirst({
      where: eq(emailTemplates.key, 'admin_reply_notification'),
    })
    if (!template) throw new Error('Missing email template: admin_reply_notification')

    const rendered = renderTemplate(template, {
      org_name: application.orgName,
      admin_url: `${getEnv().PUBLIC_BASE_URL}/admin/applications/${application.id}`,
    })

    const activeAdmins = await tx.query.admins.findMany({ where: eq(admins.isActive, true) })
    for (const admin of activeAdmins) {
      await enqueueEmail(tx, {
        to: admin.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      })
    }
  })

  revalidatePath('/portal/application')
  return { sent: true }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run db:seed && npx vitest run tests/integration/confirm.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the confirm panel and reply form**

`src/app/portal/application/ConfirmPanel.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { confirmBooth, type ConfirmState } from './actions'

const initial: ConfirmState = {}

export function ConfirmPanel({
  termsText,
  boothNumber,
}: {
  termsText: string
  boothNumber: string | null
}) {
  const [state, action, pending] = useActionState(confirmBooth, initial)

  return (
    <section className="mt-12 rounded border-l-4 border-scale-gold bg-scale-gold-pale/25 p-6">
      <h2 className="text-2xl font-bold">You have a booth. Please confirm it.</h2>
      {boothNumber && (
        <p className="mt-2">
          Your booth number is <strong>{boothNumber}</strong>.
        </p>
      )}

      <div className="mt-4 max-h-72 overflow-y-auto rounded border border-scale-rule/40 bg-white p-4">
        <div className="space-y-3 whitespace-pre-wrap text-scale-muted">
          {termsText.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>

      {state.error && (
        <p id="confirm-error" role="alert" className="mt-3 rounded bg-red-50 p-3 font-medium text-red-800">
          {state.error}
        </p>
      )}

      <form action={action} className="mt-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="agree" className="mt-1" />
          <span>I have read the booth terms above and accept them on behalf of my organization.</span>
        </label>

        <label htmlFor="confirmedByName" className="mt-4 block font-semibold">
          Your full name
        </label>
        <input
          id="confirmedByName"
          name="confirmedByName"
          className="mt-1 w-full max-w-sm rounded border border-scale-rule px-3 py-2"
        />

        <button
          type="submit"
          disabled={pending}
          className="mt-4 rounded bg-scale-blue px-5 py-3 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60"
        >
          {pending ? 'Confirming…' : 'Confirm our booth'}
        </button>
      </form>
    </section>
  )
}
```

`src/app/portal/application/ReplyForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { postReply, type ReplyState } from './actions'

const initial: ReplyState = {}

export function ReplyForm() {
  const [state, action, pending] = useActionState(postReply, initial)

  return (
    <form action={action} className="mt-6">
      <label htmlFor="body" className="block font-semibold">
        Reply to SCaLE
      </label>
      {state.sent && (
        <p id="reply-sent" className="mt-2 rounded bg-green-50 p-3 font-medium text-green-900">
          Sent. We will get back to you here.
        </p>
      )}
      {state.error && (
        <p className="mt-2 text-sm font-medium text-red-700">{state.error}</p>
      )}
      <textarea
        id="body"
        name="body"
        rows={5}
        className="mt-2 w-full rounded border border-scale-rule px-3 py-2"
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded bg-scale-blue px-5 py-3 font-semibold text-white hover:bg-scale-blue-hover disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Send reply'}
      </button>
    </form>
  )
}
```

- [ ] **Step 6: Render both on the portal page**

In `src/app/portal/application/page.tsx`, add the imports:

```tsx
import { ConfirmPanel } from './ConfirmPanel'
import { ReplyForm } from './ReplyForm'
```

Inside the `<section>` holding the message thread, immediately after the thread `<ul>`/empty-state, add:

```tsx
        {application.status !== 'withdrawn' && application.status !== 'rejected' && <ReplyForm />}
```

And immediately after that whole messages `</section>`, add:

```tsx
      {application.status === 'accepted' && (
        <ConfirmPanel termsText={settings.termsText} boothNumber={application.boothNumber} />
      )}

      {application.status === 'confirmed' && application.confirmedAt && (
        <section className="mt-12 rounded border-l-4 border-green-600 bg-green-50 p-6">
          <h2 className="text-2xl font-bold">Your booth is confirmed</h2>
          <p className="mt-2 text-scale-muted">
            Confirmed by {application.confirmedByName} on{' '}
            {application.confirmedAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}.
            We have kept a copy of the exact terms you agreed to.
          </p>
        </section>
      )}
```

Note that `settings` is already loaded in this component by Task 5, Step 6.

- [ ] **Step 7: Write the end-to-end test**

`tests/e2e/confirm.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.140' } })

/** Uses the seeded EFF application, which is in the accepted state. */
test('an accepted organization confirms its booth and the terms are frozen', async ({
  page,
  request,
}) => {
  await page.goto('/portal')
  await page.getByLabel('Email address').fill('contact@eff.org')
  await page.getByRole('button', { name: /email me a link/i }).click()
  await request.post('/api/dev/dispatch')

  const search = await fetch(
    `http://localhost:8025/api/v1/search?query=${encodeURIComponent('to:contact@eff.org')}`,
  )
  const { messages } = (await search.json()) as { messages: Array<{ ID: string }> }
  const detail = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`)
  const { Text } = (await detail.json()) as { Text: string }
  await page.goto(Text.match(/http:\/\/localhost:3000\/portal\/enter\?token=[A-Za-z0-9_-]+/)![0])

  await expect(page.getByRole('heading', { name: /you have a booth/i })).toBeVisible()
  await expect(page.getByText('$1,000')).toBeVisible()

  // Refuses to confirm without agreement.
  await page.getByLabel('Your full name').fill('A Staffer')
  await page.getByRole('button', { name: /confirm our booth/i }).click()
  await expect(page.locator('#confirm-error')).toContainText('Tick the box')

  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: /confirm our booth/i }).click()

  await expect(page.getByRole('heading', { name: /your booth is confirmed/i })).toBeVisible()
  await expect(page.getByText('Confirmed by A Staffer')).toBeVisible()
})
```

- [ ] **Step 8: Run the whole suite**

Run: `npm run db:seed && npm test && npx playwright test`
Expected: every Vitest suite and every Playwright spec PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(portal): confirm the booth with a frozen terms snapshot, and reply on the thread"
```

---

## Self-review notes

**Spec coverage added by this plan:** magic-link redemption and sessions for both audiences (Task 2); the guarded status machine with audit rows (Tasks 1, 8); the applicant portal's view, edit, withdraw, reply and confirm flows (Tasks 4, 5, 9); the admin console's sign-in, dashboard with *N of M* against the soft cap, filterable list, detail, internal notes and booth numbers (Tasks 6, 7); decisions with a pre-filled, editable, template-driven email written in the same transaction as the status change (Task 8); the access-checked logo route (Task 3); the terms snapshot that survives a later terms edit (Task 9); non-enumerating responses on both link-request endpoints (Tasks 4, 6); sample applications across every status for the demo (Task 6).

**Deferred to Plan C:** the `/admin/templates`, `/admin/settings` and `/admin/admins` screens, the `confirmation_reminder` and `admin_invite` templates, CSV export, the logo ZIP, the background outbox worker on a timer, the production Dockerfile, the Caddyfile, and backup notes. Until Plan C, `/api/dev/dispatch` flushes the outbox in development and `npm run mail:dispatch` does it from the shell.

**Where access is actually enforced:** `src/app/admin/layout.tsx` adds chrome only, and deliberately does not gate — the login page and entry route live under `/admin` and must stay reachable while signed out. Enforcement is `requireAdmin()` inside each protected page and server action: `/admin`, `/admin/applications`, `/admin/applications/[id]`, `addNote`, `assignBoothNumber` and `decide`. A reviewer should check that list is complete when adding any new admin route.

**Naming checked across tasks:** `Status`, `TRANSITIONS`, `canTransition`, `assertTransition`, `isEditable`, `STATUS_LABELS`, `DECISION_TEMPLATE_KEYS`, `transitionApplication`; `newToken`, `hashToken`, `issueToken`, `consumeToken`, `ADMIN_TOKEN_MINUTES`, `APPLICANT_TOKEN_DAYS`; `createAdminSession`, `createApplicantSession`, `getAdminSession`, `getApplicantSession`, `requireAdmin`, `requireApplicant`, `destroyAdminSession`, `destroyApplicantSession`; `sendPortalLink`, `requestPortalLink`, `sendAdminLink`, `requestAdminLink`, `signOut`; `applyEdit`, `saveApplication`, `withdrawApplication`, `recordConfirmation`, `confirmBooth`, `postReply`; `writeNote`, `addNote`, `assignBoothNumber`, `decide`, `defaultDecisionEmail`; `canSeeUpload`. Each is defined once and used with a matching signature.

**One behavioural note worth flagging to the reviewer:** `transitionApplication` sets `decidedAt`/`decidedBy` on every admin-driven move, including `under_review`. That means "decided" really means "last touched by an admin". If the distinction matters for reporting later, split the column — but for the console's purposes, knowing who last moved an application is the useful fact.
