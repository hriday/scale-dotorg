# Two stages: build with everything, run with the same tree.
#
# This deliberately keeps the full node_modules in the runner rather than
# using Next's standalone tracing. Standalone would be much smaller, but the
# entrypoint also runs database migrations through tsx, and hand-listing tsx's
# transitive dependencies into a traced tree is exactly the kind of thing that
# breaks on a server at 2am. Size is not the binding constraint for an app that
# runs once a year; a deploy that works the first time is.

FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# next build needs these present but never connects to anything.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    SESSION_SECRET=build-time-placeholder-at-least-32-chars \
    PUBLIC_BASE_URL=http://localhost:3000 \
    MAIL_FROM=dotorgs@socallinuxexpo.org \
    EMAIL_SENDER=console \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build


FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S booths -u 1001

COPY --from=builder --chown=booths:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=booths:nodejs /app/.next ./.next
COPY --from=builder --chown=booths:nodejs /app/public ./public
COPY --from=builder --chown=booths:nodejs /app/src ./src
COPY --from=builder --chown=booths:nodejs /app/package.json ./package.json
COPY --from=builder --chown=booths:nodejs /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=booths:nodejs /app/next.config.ts ./next.config.ts
COPY --chown=booths:nodejs docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER booths

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
