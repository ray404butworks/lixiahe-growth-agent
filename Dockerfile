# ---- Base ----
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/csv-charts-ai/package.json ./packages/csv-charts-ai/
RUN pnpm install --frozen-lockfile

# ---- Builder ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/csv-charts-ai/node_modules ./packages/csv-charts-ai/node_modules
COPY . .

# Docker COPY follows symlinks, breaking pnpm workspace link.
# Restore it so Node.js resolves csv-charts-ai to the real package source.
RUN rm -rf node_modules/csv-charts-ai && \
  ln -s ../packages/csv-charts-ai node_modules/csv-charts-ai

# Build workspace package first, then the app
ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT_MODE=export

# "prebuild" builds the csv-charts-ai package first
RUN pnpm build

# ---- Runner: static Next export plus bundled local API, no package install ----
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV LIXIAHE_HOST=0.0.0.0
ENV LIXIAHE_PORT=3000
ENV LIXIAHE_NO_OPEN=true
ENV LIXIAHE_MODEL_ENABLED=false
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/out ./preview
COPY --from=builder --chown=nextjs:nodejs /app/server-dist ./server-dist
COPY --from=builder --chown=nextjs:nodejs /app/scripts/serve-preview.mjs ./scripts/serve-preview.mjs
USER nextjs
EXPOSE 3000
CMD ["node", "scripts/serve-preview.mjs"]
