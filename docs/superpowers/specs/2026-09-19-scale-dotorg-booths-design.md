# SCaLE Community Booth Applications — Design

**Date:** 2026-09-19
**Status:** Approved for planning
**Event:** SCaLE 24x, April 1–4 2027, Pasadena Convention Center, 300 E Green St, Pasadena CA 91101

## Problem

SCaLE donates booth space, power, and resources to open source projects and
community groups, who exhibit alongside commercial sponsors on the expo floor.
The booth costs the project nothing. In exchange SCaLE asks that the booth be
staffed throughout the show and that the project bring something worth an
attendee's time.

Today that intake is a Google Form, and every decision and follow-up happens in
somebody's personal inbox. This application replaces the form and the inbox: one
place where organizations apply, where a small group of admins accept or reject,
and where all correspondence lives on the application it belongs to.

A $1000 late-cancellation fee now applies. The booth remains free; the fee
exists because a booth reserved and abandoned costs SCaLE a booth it could have
given to somebody else. Recording agreement to that fee — who agreed, when, and
to exactly what wording — is a first-class requirement, not a checkbox.

## Scope

In scope: public program page and application form; applicant portal for status,
edits, correspondence, and booth confirmation; admin console for review,
decisions, correspondence, templates, settings, and admin management; logistics
exports; Docker deployment.

Out of scope: payment collection (the $1000 fee is invoiced out-of-band if ever
charged), floor plan layout, attendee registration, sponsor/exhibitor sales,
inbound email parsing.

Single-event: SCaLE 24x is hardcoded in config. Operational knobs that admins
change during the season — application window, booth cap, fee amount, terms
text — live in a mutable `settings` row.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Stack | Next.js (App Router, TypeScript) + Postgres | Their own theme is Tailwind + Outfit; visual alignment is near-free. Server actions mean no second API to secure. |
| ORM | Drizzle | No query-engine binary, smaller image, plain-SQL migrations reviewable before they touch production. |
| Applicant access | Magic link, no password | No reset flows to build or support for a once-a-year form. |
| Admin access | Magic link, allowlisted emails | No password hashing or rotation. `bala@socallinuxexpo.org` seeded. |
| Staffing question | Free text | Admins read and judge; no shift grid. |
| Correspondence | Portal thread, email notification | Full thread on the application. No inbound webhook to secure. |
| Workflow | Full pipeline + internal notes | Waitlist matters when booths are capped. |
| Fee agreement | Confirm after acceptance | They agree once they actually have a booth. |
| Logo storage | Postgres `bytea` | One thing to back up. Tradeoff accepted: heavier `pg_dump`; mitigated by a 2 MB cap. |
| Application window | Admin-editable dates, soft cap | Humans decide; the cap informs, it never auto-rejects. |
| Email templates | DB-stored, admin-editable | Fixing a typo in the acceptance letter must not need a deploy. |
| Email transport | SMTP2GO REST behind an interface | A console/Mailpit sender means the demo runs with no credentials. |
| Email sending | Transactional outbox | An acceptance cannot exist without its email queued. |

## Architecture

One Next.js image, one Postgres container. Three route groups over one schema
and one session layer:

- `(public)` — program page, application form
- `(portal)` — applicant's magic-link view
- `(admin)` — reviewer console

Forms are server actions validated server-side with Zod. The same Zod schemas
drive client-side hints, so the rules are defined once.

### Module boundaries

```
src/
  db/            schema.ts, migrations/, client.ts
  domain/
    application.ts   status machine, transition guards
    settings.ts      window open/closed, cap accounting
    terms.ts         terms text resolution + snapshotting
  services/
    auth.ts          token issue/verify, session create/destroy
    mail/
      sender.ts      EmailSender interface
      smtp2go.ts     ConsoleSender / MailpitSender / Smtp2goSender
      outbox.ts      enqueue, worker, retry policy
      render.ts      template + variables -> subject/text/html
    uploads.ts       validate, store, serve
    export.ts        CSV, logo ZIP
  app/(public|portal|admin)/...
```

Rule: route handlers and server actions do authentication, validation, and
orchestration only. Status transitions live in `domain/application.ts` and
nowhere else — that function is the single place that knows an accepted
application cannot go back to submitted.

## Data model

### `settings` (single row, `id = 1` check constraint)

`applications_open_at`, `applications_close_at`, `booth_cap`,
`late_cancellation_fee_cents` (default `100000`), `terms_text`,
`terms_version`, `updated_at`, `updated_by`.

Editing `terms_text` bumps `terms_version`. Confirmations snapshot the text, so
a later edit never rewrites what somebody already agreed to.

### `admins`

`id`, `email` (citext unique), `name`, `is_active`, `invited_by`, `invited_at`,
`last_login_at`, `created_at`.

Deactivation rather than deletion: an admin who made decisions must remain
referenceable from the audit log.

### `applications`

| Column | Notes |
|---|---|
| `id` uuid | |
| `org_name` | required |
| `contact_name` | required |
| `contact_email` citext | required; the magic-link identity |
| `website` | required, must parse as http(s) URL |
| `about` | brief write-up, 100–2000 chars |
| `showcase` | what they'll show, 100–2000 chars |
| `community_impact` | how it advances advocacy and interests attendees, 100–2000 chars |
| `staffing_plan` | free text, 100–2000 chars |
| `sign_text` | ≤60 chars — printed signage |
| `logo_upload_id` | → `uploads` |
| `status` | see state machine |
| `booth_number` | nullable, admin-assigned |
| `submitted_at`, `updated_at` | |
| `decided_at`, `decided_by` | → `admins` |
| `confirmed_at`, `confirmed_by_name`, `confirmed_terms_snapshot`, `confirmed_terms_version` | the fee paper trail |
| `withdrawn_at` | |

`about`, `showcase`, and `community_impact` are separate fields because asked as
one question, applicants answer the first part and drift. Asked as three, the
reviewers get three answers.

### `uploads`

`id`, `application_id` (nullable), `filename`, `content_type`, `byte_size`,
`sha256`, `data` bytea, `created_at`.

`application_id` is nullable so the pair of references does not form a circular
non-deferrable FK: insert the application, insert the upload pointing back at
it, then set `applications.logo_upload_id`. `applications.logo_upload_id` is the
authoritative pointer to the current logo; `uploads.application_id` exists for
history and cascade.

PNG, SVG, JPEG, PDF. 2 MB cap. Content type sniffed from magic bytes, not
trusted from the client. SVGs are sanitized on upload (strip `<script>`, event
handlers, external refs) since they are served from our origin. Raster logos
below 600 px on the long edge get a warning, not a rejection — signage quality
is a conversation, not a validation error.

Replacing a logo inserts a new row and repoints the FK; the old row stays as
cheap history.

### `messages` (visible to the applicant)

`id`, `application_id`, `direction` (`outbound`|`inbound`), `author_admin_id`
(null for inbound), `subject`, `body`, `created_at`, `email_outbox_id`,
`read_by_admin_at`.

### `internal_notes`

`id`, `application_id`, `admin_id`, `body`, `created_at`. Never rendered on any
portal route. Enforced by living in a separate table, not by a boolean somebody
might forget to filter on.

### `email_outbox`

`id`, `to_email`, `from_email`, `reply_to`, `subject`, `body_text`, `body_html`,
`message_id` (nullable — system mail like magic links has no thread),
`status` (`pending`|`sending`|`sent`|`failed`), `attempts`, `last_error`,
`next_attempt_at`, `sent_at`, `provider_message_id`, `created_at`.

Exponential backoff, 5 attempts. A `failed` row surfaces on the admin dashboard.

### `email_templates`

`key` unique, `name`, `subject`, `body`, `variables` (documented list),
`updated_at`, `updated_by`.

Keys: `submission_receipt`, `magic_link_applicant`, `magic_link_admin`,
`info_request`, `waitlisted`, `accepted`, `rejected`, `confirmation_reminder`,
`admin_reply_notification`, `admin_invite`.

Rendering is literal `{{variable}}` substitution against a fixed allowlist per
template, HTML-escaped. No expression evaluation — templates are admin-editable
and must not become a code execution surface.

### `auth_tokens`

`id`, `token_hash` (sha256 of a 32-byte random token), `purpose`
(`admin_login`|`applicant_portal`), `admin_id`, `application_id`, `expires_at`,
`consumed_at`, `created_at`, `requested_ip`.

Raw tokens exist only in the email. Admin tokens: 30 minutes. Applicant tokens:
7 days. Both single-use.

### `sessions`

`id`, `token_hash`, `subject_type` (`admin`|`applicant`), `admin_id`,
`application_id`, `expires_at`, `created_at`, `last_seen_at`.

httpOnly, Secure, SameSite=Lax cookie. Admin sessions 7 days, applicant 30 days,
both sliding.

### `audit_log`

`id`, `actor_type`, `actor_id`, `application_id`, `action`, `detail` jsonb,
`created_at`. Appended for every status change, booth assignment, settings
change, admin invite/deactivation, and confirmation.

## Status machine

```
submitted ──> under_review ──> accepted ──> confirmed
    │              │  │  │
    │              │  │  └──> rejected
    │              │  └─────> waitlisted ──> accepted | rejected
    │              └────────> info_requested ──> under_review
    └──> withdrawn   (also reachable from under_review,
                      info_requested, waitlisted, accepted)
```

`under_review` is a convenience, not a toll gate: an admin may go straight from
`submitted` to `accepted`, `rejected`, `waitlisted`, or `info_requested`.
Formally, any of `{submitted, under_review, waitlisted, info_requested}` may
move to any other of that set or to `accepted`/`rejected`; `accepted` may move
to `confirmed`, `rejected`, or `withdrawn`; `confirmed` may move only to
`withdrawn`; `rejected` and `withdrawn` are terminal.

- Only `domain/application.ts` performs transitions; every one is guarded and audited.
- `withdrawn` is reachable by the applicant from any pre-confirmed state, and by an admin from any state.
- `confirmed` requires `confirmed_by_name` and a terms snapshot, atomically.
- Applicants may edit only in `submitted`, `under_review`, or `info_requested`, and only while the window is open.

## Flows

### Public

`/` — what the program is, who it's for, the dates and venue, what SCaLE
provides, what's expected in return, the late-cancellation term stated plainly,
and the deadline. Copy adapted from SCaLE's own booth-grant announcements.

`/apply` — the form. Before `applications_open_at` or after
`applications_close_at`, the form is replaced by a dated message rather than
404ing. On success: application created as `submitted`, an applicant token
issued, `submission_receipt` queued, and a confirmation page shown that does not
leak the portal link (it goes to the verified address only).

Rate limits: 5 submissions/hour/IP, 3 link requests/hour/email, enforced by an
in-process fixed-window counter. Stated limitation: the counters reset on
restart and would not be shared if the app were ever scaled past one container.
That is acceptable here — the traffic is a few hundred submissions a year and
the real gate is that a human reads every one. Moving to a `rate_limits` table
is the fix if that ever stops being true.

### Portal

`/portal` — enter email, receive link. Response wording is identical whether or
not an application exists for that address; otherwise the endpoint reveals which
organizations applied.

`/portal/application` — status banner, submitted answers, Edit (window
permitting), message thread with reply box, Withdraw. When `accepted`, a Confirm
Booth panel showing the booth number if assigned and the full current terms;
confirming records the typed name, timestamp, and a frozen copy of that text.

### Admin

`/admin/login` — email → magic link, allowlisted active admins only, same
non-enumerating response.

`/admin` — counts by status, *N of M* accepted against the soft cap,
acceptances awaiting confirmation, unanswered applicant replies, failed emails.

`/admin/applications` — filter by status, search across org/contact/website,
sort by submitted date. Columns: org, status, submitted, booth #, awaiting-reply
flag.

`/admin/applications/[id]` — full application, logo preview, sign text as it
will print, decision panel, booth number field, internal notes, message thread,
audit trail.

Decision panel: pick the new status; the compose box pre-fills from the matching
template with variables resolved; admin edits freely, previews, and sends — or
unchecks "send email" and transitions silently.

`/admin/templates` — edit subject and body, variable reference, preview against
a sample application.

`/admin/settings` — window dates, booth cap, fee amount, terms text.

`/admin/admins` — invite by email, deactivate. Cannot deactivate yourself, and
the last active admin cannot be deactivated.

Exports: CSV of accepted+confirmed (org, contact, email, website, sign text,
booth number, status, confirmed-at); ZIP of their logos named
`<slug>-<booth>.<ext>`.

### Correspondence

The `messages` row and its `email_outbox` row are written in the same
transaction as the status change. A separate worker polls `pending` rows and
sends. Outbound mail is from `dotorgs@socallinuxexpo.org` with Reply-To the
same, so a human reply still lands somewhere sensible even though the thread
lives in the portal. Applicant replies queue `admin_reply_notification` to every
active admin.

## Look and feel

Tokens lifted from `themes/custom/scale/dist/css/styles.css`:

```
primary #1d71f0   hover #1a66d8   dark #175ac0   light #4a8df3   pale #a5c6f9
accent  #f0b100   #f3c133   pale #f9e099
ink     #222      muted #4e4e4e   rules #a7a7a7   on #fff
```

Outfit, self-hosted as a variable woff2 (`public/fonts/`, 47 KB) rather than
fetched from Google Fonts — the Docker build must not need the network, and a
self-hosted app should not phone out on every page load. The SCaLE mark is
vendored at `public/logo.svg`.

Their hero's notched lower edge — `clip-path: polygon(0 0, 100% 0, 100% 92%,
50% 100%, 0 92%)` — is echoed on the public page header.

Buttons match theirs: `0.75rem 1.25rem`, `#1d71f0` on white text, `1rem`.

Accessibility: WCAG AA contrast, real labels, an error summary that receives
focus on failed submit, full keyboard operation, visible focus rings.

## Deployment

Multi-stage Dockerfile: `node:24-alpine` builder → `next build` standalone →
non-root runner. Migrations run on container start before the server binds.
`/healthz` for the proxy.

Two compose files. `docker-compose.yml` is the local one: app +
`postgres:17-alpine` + Mailpit, with `EMAIL_SENDER=mailpit`.
`docker-compose.prod.yml` is app + Postgres only, no Mailpit, with
`EMAIL_SENDER=smtp2go` — the app refuses to boot in production if
`EMAIL_SENDER=smtp2go` and `SMTP2GO_API_KEY` is unset, rather than silently
dropping acceptance emails.

```
DATABASE_URL  SESSION_SECRET  PUBLIC_BASE_URL
MAIL_FROM=dotorgs@socallinuxexpo.org
EMAIL_SENDER=console|mailpit|smtp2go   SMTP2GO_API_KEY
```

Behind a TLS-terminating reverse proxy; a sample Caddyfile ships in the repo.
The app trusts `X-Forwarded-*` only from the proxy. Backups are `pg_dump` —
which covers the logos too, that being the point of `bytea`.

## Local demo

`docker compose up` seeds `bala@socallinuxexpo.org` as admin, an open
application window, default templates, the drafted terms, and sample
applications spread across every status. Mailpit at `:8025` catches every send,
which is how magic links are clicked locally with no SMTP2GO credentials.

## Testing

TDD throughout.

- **Vitest, unit:** Zod schemas, status-transition guards, template rendering and
  escaping, token hashing and expiry, upload sniffing and SVG sanitization, CSV shaping.
- **Integration, real Postgres:** the status machine and the transactional
  outbox — the two places a bug costs somebody a booth. Assert that a failed
  email send never leaves an application accepted-but-unnotified, and that a
  rolled-back transition leaves no outbox row.
- **Playwright, three journeys:** apply → receipt; admin login → accept → email
  queued and visible in Mailpit; portal link → confirm booth → terms snapshot recorded.

## Open items

Answered 2026-09-20:

1. **Expo floor opening times — admin-configured.** Rather than hardcode them,
   `settings.expoHours` holds the three days as display strings and the public
   page renders whatever is there. Seeded as Fri Apr 2 1:00–5:00 pm, Sat Apr 3
   `TBD`–5:00 pm, Sun Apr 4 `TBD`–12:00 pm. An admin replaces the two `TBD`s
   once SCaLE publishes them; no deploy needed.
2. **Terms text — admin-configured**, as already designed. `settings.termsText`
   is the source of truth, the drafted wording below is only the seeded default,
   and editing it bumps `termsVersion` while confirmations keep their snapshot.
3. **Program name — "Community Booths"**, confirmed.
4. **Application deadline.** Seeded 2027-01-15, admin-editable. For 23x, booths
   were finalized in early January for a March show.
5. **Prior art.** The existing nomination Google Form requires sign-in, so its
   exact questions could not be read. If the current fields matter, export it.

Because both (1) and (2) are admin-configured, the `/admin/settings` screen in
Plan C must expose the application window, booth cap, fee amount, terms text
**and the expo hours** — the hours are no longer editable any other way.

### Drafted terms text (seeded default, admin-editable)

> SCaLE provides community booth space, power, and basic booth furnishings at no
> cost to your organization. In accepting a booth you agree to staff it during
> all expo floor hours and to notify us as early as possible if your plans
> change.
>
> Booth space is limited and every booth we hold is one another project cannot
> have. If you cancel fewer than 30 days before the event, or do not occupy your
> booth during the show, a late cancellation fee of $1,000 applies. Cancellations
> must be made in writing to dotorgs@socallinuxexpo.org.
>
> We would always rather hear from you early than charge this fee. Tell us as
> soon as you know.

## Build order

1. Schema, migrations, seed, Docker compose, Mailpit — a running empty app
2. Public form + validation + receipt email — end to end through Mailpit
3. Applicant portal: magic link, session, view, edit, withdraw
4. Admin: login, list, detail, internal notes
5. Decisions + compose/send + outbox worker
6. Confirm-booth flow and the terms snapshot
7. Templates, settings, admin management
8. Exports, dashboard counts, polish
9. Production Dockerfile, Caddyfile, backup notes

Steps 1–6 are the demo. 7–9 harden it for your servers.
