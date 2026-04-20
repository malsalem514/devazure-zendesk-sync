# syntax=docker/dockerfile:1.7
#
# Zendesk <-> Azure DevOps sync service.
# Two-stage build: compile TypeScript in the build stage, copy only dist/
# and pruned production deps into the runtime image.
#
# Base: node:24-slim (Debian slim). No Oracle Instant Client required —
# node-oracledb 6.x runs in thin mode (pure JS TNS implementation).

# ---------- build stage ----------
FROM node:24-slim AS build
WORKDIR /app

# Install deps against lockfile first so this layer caches when src/ changes.
COPY package.json package-lock.json ./
RUN npm ci

# Compile TypeScript to dist/, then drop dev deps from node_modules.
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

# ---------- runtime stage ----------
FROM node:24-slim AS runtime
WORKDIR /app

# Node 24 still defaults the libuv threadpool to 4. oracledb's pool plus
# cron handlers contend on it — bumping to 10 matches Oracle pool max.
ENV NODE_ENV=production \
    UV_THREADPOOL_SIZE=10 \
    PORT=8787

# The node:slim images ship a non-root `node` user (uid 1000). Use it.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/scripts ./scripts

USER node
EXPOSE 8787

# curl/wget are stripped from slim; use Node's built-in fetch for healthcheck.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
