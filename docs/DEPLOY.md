# Deploying SCaLE Community Booths

The app is one container plus Postgres, behind a TLS-terminating reverse proxy.
Logos live in the database, so `pg_dump` is the whole backup.

## What you need before starting

| Thing | Why | Status |
|---|---|---|
| A host with Docker and Compose v2 | runs the stack | you have this |
| DNS A/AAAA record for `booths.socallinuxexpo.org` → the host | Caddy gets its certificate on first request | **needed** |
| SMTP2GO API key | sending acceptances and magic links | **needed** |
| `dotorgs@socallinuxexpo.org` verified as a sender in SMTP2GO | otherwise mail is rejected or lands in spam | **needed** |

Nothing else is outstanding. If the hostname differs from
`booths.socallinuxexpo.org`, change it in `Caddyfile` and in `PUBLIC_BASE_URL`.

## Verified

The image has been built and run against an empty database: migrations applied,
the production seed created the settings row, the templates and
`bala@socallinuxexpo.org` and **no sample organizations**, the server came up,
and the container's own mail worker delivered an admin sign-in link through SMTP
on its 15-second timer. The dev-only `/api/dev/*` routes return 404 under
`NODE_ENV=production`.

What has *not* been exercised is SMTP2GO itself — locally that hop went to
Mailpit. The first real send is the acceptance of your first application, so
send yourself an admin invite before you announce the form.

## Current deployment

**https://booths.socallinuxexpo.org** — live, with a real Let's Encrypt
certificate. Caddy is the only thing listening publicly (80 and 443); the app,
Mailpit and Postgres are all loopback-only behind it. HTTP redirects to HTTPS
and HSTS is set for a year.

`CADDYFILE` in `.env.production` selects the TLS config:

| Value | Serves | Certificate |
|---|---|---|
| `./Caddyfile` | `booths.socallinuxexpo.org` | Let's Encrypt (current) |
| `./Caddyfile.staging` | the bare IP | Caddy's local CA (before DNS) |

Mail goes out through **SMTP2GO** as `dotorgs@socallinuxexpo.org`. Verified by
submitting a real application and watching the receipt email reach `sent` with a
provider message id on the first attempt.

The API key is scoped to sending only, so it cannot call `/v3/activity/search`.
That means delivery to an inbox cannot be confirmed from the server — only that
SMTP2GO accepted the message. If mail ever seems to vanish, check the SMTP2GO
dashboard rather than looking for it in the database.

Mailpit is still in the compose file and now receives nothing. It is bound to
loopback and harmless; drop the service whenever you like.

## First deploy

```bash
git clone <this repo> /srv/scale-dotorg
cd /srv/scale-dotorg

cp .env.production.example .env.production
```

Every compose command needs `--env-file .env.production`. Compose reads
interpolation variables (`${POSTGRES_PASSWORD}`) from that flag or from a `.env`
file — a service's `env_file:` only populates the container, not the compose
file itself.

Fill in `.env.production`:

```bash
# A password for Postgres, and the same one inside DATABASE_URL
openssl rand -base64 24

# SESSION_SECRET — must be at least 32 characters
openssl rand -base64 48
```

Set `SEED_ON_START=true` for the first boot only. That creates the settings row,
the email templates and the first admin (`bala@socallinuxexpo.org`). Then:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app
```

Wait for `Applying database migrations...` then `Starting server...`. Check it:

```bash
curl -s localhost:3000/healthz     # {"status":"ok"}
```

Now set `SEED_ON_START=false` in `.env.production` and
`docker compose --env-file .env.production -f docker-compose.prod.yml up -d` to apply. Leaving it on is not
destructive — the seed is idempotent — but it re-asserts the demo baseline on
every restart, which you do not want once real applications exist.

## Put Caddy in front

```bash
sudo apt install caddy          # or your platform's package
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains the certificate automatically once DNS resolves to this host. The
app binds to `127.0.0.1:3000`, so nothing reaches it except through the proxy.

The app trusts `X-Forwarded-For` for rate limiting. That header is set by Caddy
from the real peer address; do not expose port 3000 directly, or a client could
forge it and bypass the limiter.

## First sign-in

Go to `https://booths.socallinuxexpo.org/admin/login`, enter
`bala@socallinuxexpo.org`, and follow the emailed link. From there:

1. **Settings** — set the real application window, booth cap, fee, the booth
   terms, and the expo floor hours (Saturday and Sunday opening times are
   currently `TBD`).
2. **Templates** — read the acceptance, rejection, waitlist and info-request
   wording and make it yours.
3. **Admins** — invite the rest of the team.

## Backups

Logos are `bytea` in Postgres, so the dump covers everything.

```bash
crontab -e
0 3 * * * /srv/scale-dotorg/scripts-backup.sh >> /var/log/booths-backup.log 2>&1
```

Keeps 30 days in `./backups`. Copy them off the host — a backup on the same disk
is not a backup. Restore with:

```bash
gunzip -c backups/booths-YYYYMMDD-HHMMSS.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db psql -U booths booths
```

Test a restore into a scratch database before you need one for real.

## Updating

```bash
cd /srv/scale-dotorg
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Migrations run automatically at container start, before the server accepts
traffic. They are plain SQL in `src/db/migrations/` — read them before
deploying anything that touches existing columns.

## How mail actually goes out

Every email is written to the `email_outbox` table in the same transaction as
the thing that caused it, so an acceptance cannot exist without its email
queued. A worker inside the app polls every 15 seconds and sends through the
SMTP2GO REST API, retrying at 1, 5, 15 and 60 minutes before giving up.

Anything that ends up `failed` is counted on the admin dashboard. To see why:

```sql
SELECT to_email, subject, attempts, last_error
FROM email_outbox WHERE status = 'failed';
```

To retry one after fixing the cause:

```sql
UPDATE email_outbox
SET status = 'pending', attempts = 0, next_attempt_at = now()
WHERE id = '...';
```

Set `MAIL_WORKER=off` to stop the worker without stopping the app — useful if
you ever need to inspect the queue before it drains.

## Things that are deliberately not automatic

- **The booth cap never auto-rejects.** It shows *N of M* on the dashboard and
  leaves the decision to a person.
- **Acceptance does not confirm a booth.** The organization confirms, and that
  records who agreed, when, and a frozen copy of the exact terms text. That
  record is what a disputed deposit would rest on.
- **Rate limits are per-process and in memory.** They reset when the container
  restarts and are not shared if you ever run more than one app container. At a
  few hundred applications a year that is fine; if it stops being fine, move the
  counters into Postgres.
