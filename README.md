# SCaLE Community Booths

Booth applications for open source projects and community groups at
[SCaLE](https://www.socallinuxexpo.org/). Replaces a Google Form and a personal
inbox: organizations apply here, admins decide here, and every message about an
application lives on the application.

## Running it locally

```bash
docker compose up -d      # Postgres on :5433, Mailpit on :8025
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- Public site: http://localhost:3000
- Admin: http://localhost:3000/admin/login as `bala@socallinuxexpo.org`
- All outgoing mail: http://localhost:8025

No SMTP credentials are needed locally. Mail is queued in the database; flush it
with `npm run mail:dispatch` (the background worker is off in development so
tests stay deterministic).

Postgres is on **5433**, not 5432, to avoid colliding with another local
database.

## Layout

```
src/
  domain/status.ts        status vocabulary — no database imports, safe in the browser
  domain/application.ts   transitionApplication(), the only thing that changes a status
  domain/settings.ts      application window, fee formatting, default terms
  services/auth/          magic-link tokens and cookie sessions
  services/mail/          sender backends, template rendering, transactional outbox
  services/uploads.ts     magic-byte sniffing and SVG sanitization
  services/export.ts      CSV, with spreadsheet-formula defusing
  app/(public)            landing page and application form
  app/portal              applicant's magic-link view
  app/admin               reviewer console
```

Two rules worth knowing before changing anything:

1. **Status changes go through `transitionApplication`.** It writes the status,
   the audit row, the thread entry and the queued email in one transaction, so
   an organization cannot be accepted without the email that tells them so.
2. **`domain/status.ts` must not import the database.** Client components use
   its labels; adding a database import there drags the Postgres driver into the
   browser bundle and the build fails.

## Tests

```bash
npm test          # unit and integration, against the local Postgres
npm run e2e       # Playwright, against the dev server and Mailpit
```

Integration tests truncate the applications table, so the browser suite reseeds
itself before running.

## Deploying

See [docs/DEPLOY.md](docs/DEPLOY.md).

## Design and plans

- [Design spec](docs/superpowers/specs/2026-09-19-scale-dotorg-booths-design.md)
- [Plan A — foundation and public application](docs/superpowers/plans/2026-09-19-plan-a-foundation-and-public-application.md)
- [Plan B — portal and admin review](docs/superpowers/plans/2026-09-20-plan-b-portal-and-admin-review.md)
