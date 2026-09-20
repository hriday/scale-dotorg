#!/bin/sh
set -e

echo "Applying database migrations..."
npx tsx src/db/migrate.ts

if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "Seeding baseline data (settings, templates, first admin)..."
  npx tsx src/db/seed.ts
fi

echo "Starting server..."
exec "$@"
