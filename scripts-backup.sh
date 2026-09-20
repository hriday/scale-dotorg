#!/bin/sh
# Nightly backup. Logos live in Postgres, so the dump is the whole backup.
#   0 3 * * * /srv/scale-dotorg/scripts-backup.sh >> /var/log/booths-backup.log 2>&1
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
# Staging and production differ only in which compose file is in use.
COMPOSE_FILE="${COMPOSE_FILE:-$DIR/docker-compose.prod.yml}"
[ -f "$COMPOSE_FILE" ] || COMPOSE_FILE="$DIR/docker-compose.staging.yml"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$DIR/backups/booths-$STAMP.sql.gz"

mkdir -p "$DIR/backups"
docker compose --env-file "$DIR/.env.production" -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U booths --no-owner booths | gzip > "$OUT"

echo "$(date -Iseconds) wrote $OUT ($(du -h "$OUT" | cut -f1))"

# Keep 30 days.
find "$DIR/backups" -name 'booths-*.sql.gz' -mtime +30 -delete
