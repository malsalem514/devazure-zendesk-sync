# Deployment — Jestais Linux Docker Host

Target: `ubuntu-docker-host` (172.16.20.97), Ubuntu 24.04, Docker + Caddy + Watchtower, stacks at `/srv/stacks/`.

## Layout

```
/srv/stacks/zendesk-ado-sync/
├── docker-compose.yml      # synced from this repo
├── Dockerfile              # synced from this repo
├── .env                    # host-managed secrets (never committed)
└── <repo clone or tarball> # build context
```

## First-time bring-up

1. Clone the repo into `/srv/stacks/zendesk-ado-sync/` (or rsync a release tarball).
2. Copy `.env.example` → `.env` and fill in live values:
   - `ZENDESK_WEBHOOK_SECRET`, `ZENDESK_API_USERNAME`, `ZENDESK_API_TOKEN`, `ZENDESK_BASE_URL`
   - `DEVAZURE_ORG_URL`, `DEVAZURE_PROJECT`, `DEVAZURE_PAT`
   - `DEVAZURE_WEBHOOK_USERNAME`, `DEVAZURE_WEBHOOK_PASSWORD` (shared secret with the ADO service-hook subscription)
   - `ORACLE_DB_USERNAME`, `ORACLE_DB_PASSWORD`, `ORACLE_DB_HOST=srv-db-100`, `ORACLE_DB_SERVICE=SUPPOPS`
   - `SYNC_DRY_RUN=false` for production
3. `docker compose build && docker compose up -d`
4. Verify:
   - `curl http://127.0.0.1:8787/healthz` → `{ "ok": true }`
   - `curl http://127.0.0.1:8787/readyz`  → `{ "ok": true, "oracle": true }`
   - `docker compose logs zendesk-ado-sync | head -50` shows Oracle pool created + schema initialized.

## Caddy

Caddy runs on the host (not in the compose stack). Add this site block to `/etc/caddy/Caddyfile` (or drop it in `/etc/caddy/conf.d/` if the host splits configs), then `sudo systemctl reload caddy`:

```caddy
zendesk-sync.jestais.com {
    reverse_proxy 127.0.0.1:8787
}
```

The final hostname is not yet confirmed (see open blockers in the plan) — coordinate with IT before issuing the certificate.

## Networking

- `127.0.0.1:8787` — loopback publish in compose; not reachable on the LAN.
- `srv-db-100 → 172.16.25.63` — pinned via `extra_hosts` in compose. Update if Oracle moves.
- Outbound HTTPS to `dev.azure.com`, `jestaissupport.zendesk.com`, and the Oracle DB (TCP 1521 on the internal network).

## Watchtower

The stack carries `com.centurylinklabs.watchtower.enable=true`. Once the image ships from a registry, Watchtower on the host will auto-pull updates. For the current build-local flow, Watchtower effectively no-ops.

## Service hook registration (Phase 4 follow-on)

After the service is reachable on its public URL:

```sh
docker compose exec zendesk-ado-sync \
  node --env-file-if-exists=.env scripts/register-ado-service-hook.mjs
```

This creates `workitem.updated` and `workitem.created` subscriptions on the target project. If it fails with 403, the polling reconciler (`src/reconciler.ts`) serves as fallback — no action needed.

## Logs

Container stdout/stderr is the only log sink today. Tail with:

```sh
docker compose logs -f zendesk-ado-sync
```

If structured-log ingestion becomes a requirement later, slot a log driver into `docker-compose.yml` under the service.
