# Client Handoff

This service is delivered as a Docker Compose stack that runs alongside existing stacks at `/srv/stacks/` on the client's Linux Docker host.

## What to deliver

Preferred:

- The branch `claude/amazing-darwin` (or its merged successor on `main`) of this repository, rsynced or `git clone`'d to `/srv/stacks/zendesk-ado-sync/` on the client host
- A populated `.env` file at `/srv/stacks/zendesk-ado-sync/.env` (0600 perms, admin user) with real credentials for Zendesk, Azure DevOps, and Oracle

Alternative (air-gapped):

- The tarball produced by `npm run package:standalone` (`release/devazure-zendesk-sync/`), plus the `Dockerfile` + `docker-compose.yml` + `.dockerignore` from the repo root

## Delivery contents

A working handoff contains:

- `Dockerfile` + `docker-compose.yml` + `.dockerignore`
- `package.json` + `package-lock.json`
- `src/` (TypeScript sources; compiled inside the Docker build stage)
- `scripts/` (admin tools: field + form setup, webhook + service-hook registration)
- `tsconfig.json`
- `.env.example` (no real credentials)
- `README.md`, `CLAUDE.md`, `docs/`, `conductor/` (project context)

The generated Docker image is `zendesk-ado-sync:latest`, two-stage `node:24-slim`, ≈250 MB, non-root `node` user, Node-fetch-based `HEALTHCHECK`. No Oracle Instant Client needed — `oracledb` runs in thin mode.

## Delivery steps (client host)

```sh
# 1. Sync repo to the stack directory
sudo mkdir -p /srv/stacks/zendesk-ado-sync
sudo chown $USER:$USER /srv/stacks/zendesk-ado-sync
# Either: rsync from dev machine, or: git clone into that path

# 2. Populate .env (see Environment in README.md for required keys)
cp .env.example .env
$EDITOR .env
chmod 600 .env

# 3. Build + start
docker compose build
docker compose up -d

# 4. Verify
curl -s http://127.0.0.1:8787/healthz     # { "ok": true, "dryRun": <bool> }
curl -s http://127.0.0.1:8787/readyz      # { "ok": true, "oracle": true }
docker compose logs --tail 50 zendesk-ado-sync
```

See [docs/ops/deployment.md](./docs/ops/deployment.md) for the full runbook, Caddy site block, and post-bring-up service-hook registration commands.

## Pre-delivery checklist

- `.env` populated with real credentials; file is `chmod 600`
- `SYNC_DRY_RUN` set to `false` only after a first dry-run smoke test
- Zendesk custom fields created in the tenant (one-shot): `docker compose exec zendesk-ado-sync node scripts/create-zendesk-fields.mjs`
- Pilot ticket form configured (if needed): `scripts/clone-zendesk-form.mjs --source <id> --name "<name>" --agents-only --attach-ado`
- Public URL + TLS path decided (Caddy site block for `<host>.jestais.com` uses the existing wildcard cert)
- Zendesk webhook registered: `scripts/register-zendesk-webhook.mjs` (prints the signing secret — paste into `.env` as `ZENDESK_WEBHOOK_SECRET`, then restart container)
- ADO service-hook subscriptions registered: `scripts/register-ado-service-hook.mjs` (requires `ADO_WEBHOOK_PUBLIC_URL` + matching `DEVAZURE_WEBHOOK_USERNAME` / `DEVAZURE_WEBHOOK_PASSWORD` in `.env`)
- First end-to-end test: create a ticket on the pilot form, watch `docker compose logs -f` for the create + writeback + reverse-sync cycle
