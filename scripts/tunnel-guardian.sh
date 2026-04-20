#!/usr/bin/env bash
# tunnel-guardian.sh
#
# Detects when the Cloudflare quick-tunnel public URL rotates and PUTs the new
# URL into the Zendesk app installation's `backendBaseUrl` setting so the
# sidebar keeps working.
#
# Runs on ubuntu-docker-host under cron. Reads the tunnel URL from the tunnel
# container's Docker logs, compares to what Zendesk currently knows, and if
# they differ issues a PUT against the installation endpoint.
#
# Env (loaded by caller from /srv/stacks/zendesk-ado-sync/.env):
#   ZENDESK_BASE_URL
#   ZENDESK_API_USERNAME
#   ZENDESK_API_TOKEN
#   ZAF_INSTALLATION_ID              (e.g. 50988210128019)
#   TUNNEL_CONTAINER                 (defaults to zendesk-ado-quicktunnel)
#   TUNNEL_GUARDIAN_DRY_RUN=true     (optional)
#
# Exit:
#   0 = no action needed OR successful update
#   1 = internal error
#   2 = tunnel URL unreadable (container restarting, logs truncated)

set -euo pipefail

log_info()  { printf '{"t":"%s","level":"INFO","event":"%s"%s}\n'  "$(date -u +%FT%TZ)" "$1" "${2:-}"; }
log_warn()  { printf '{"t":"%s","level":"WARN","event":"%s"%s}\n'  "$(date -u +%FT%TZ)" "$1" "${2:-}" >&2; }
log_error() { printf '{"t":"%s","level":"ERROR","event":"%s"%s}\n' "$(date -u +%FT%TZ)" "$1" "${2:-}" >&2; }

require_env() {
  local name="$1"
  local val="${!name:-}"
  if [[ -z "$val" ]]; then
    log_error "missing_env" ",\"name\":\"$name\""
    exit 1
  fi
}

require_env ZENDESK_BASE_URL
require_env ZENDESK_API_USERNAME
require_env ZENDESK_API_TOKEN
require_env ZAF_INSTALLATION_ID

CONTAINER="${TUNNEL_CONTAINER:-zendesk-ado-quicktunnel}"
DRY_RUN="${TUNNEL_GUARDIAN_DRY_RUN:-false}"
BASE="${ZENDESK_BASE_URL%/}"
AUTH="$ZENDESK_API_USERNAME/token:$ZENDESK_API_TOKEN"

# Read most-recent trycloudflare URL from docker logs (stdout+stderr).
TUNNEL_URL=$(docker logs --tail 500 "$CONTAINER" 2>&1 \
  | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' \
  | tail -1 || true)

if [[ -z "$TUNNEL_URL" ]]; then
  log_warn "tunnel_url_not_found" ",\"container\":\"$CONTAINER\""
  exit 2
fi

# Fetch current Zendesk installation settings.
ZD_JSON=$(curl -sS -u "$AUTH" \
  "$BASE/api/v2/apps/installations/$ZAF_INSTALLATION_ID.json")

ZD_URL=$(printf '%s' "$ZD_JSON" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("settings",{}).get("backendBaseUrl",""))' \
  2>/dev/null || true)

if [[ -z "$ZD_URL" ]]; then
  log_error "zendesk_get_failed" ",\"response\":\"$(printf %s "$ZD_JSON" | head -c 200 | tr -d '"\\')\""
  exit 1
fi

if [[ "$ZD_URL" == "$TUNNEL_URL" ]]; then
  log_info "url_unchanged" ",\"url\":\"$TUNNEL_URL\""
  exit 0
fi

log_info "url_drift_detected" ",\"tunnelUrl\":\"$TUNNEL_URL\",\"zendeskUrl\":\"$ZD_URL\""

if [[ "$DRY_RUN" =~ ^(1|true|yes|on)$ ]]; then
  log_info "dry_run_skipped_update"
  exit 0
fi

HTTP_CODE=$(curl -sS -o /tmp/tunnel-guardian.resp -w '%{http_code}' \
  -u "$AUTH" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d "{\"settings\":{\"backendBaseUrl\":\"$TUNNEL_URL\"}}" \
  "$BASE/api/v2/apps/installations/$ZAF_INSTALLATION_ID.json")

if [[ "$HTTP_CODE" != "200" ]]; then
  log_error "zendesk_put_failed" ",\"http\":$HTTP_CODE,\"body\":\"$(head -c 200 /tmp/tunnel-guardian.resp | tr -d '"\\')\""
  exit 1
fi

log_info "url_updated" ",\"from\":\"$ZD_URL\",\"to\":\"$TUNNEL_URL\""
