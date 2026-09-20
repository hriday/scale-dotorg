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
  const ms = purpose === 'admin_login' ? ADMIN_TOKEN_MINUTES * 60_000 : APPLICANT_TOKEN_DAYS * 86_400_000
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
 * Redeems a token exactly once. The UPDATE carries the unconsumed and unexpired
 * conditions, so two simultaneous requests cannot both win.
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
