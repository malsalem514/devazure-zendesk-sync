# Client Handoff

This service is meant to be delivered as a standalone integration package.

## Current Live Pilot Status

- Date validated: `2026-04-17`
- Host service is running on `ubuntu-docker-host` at `127.0.0.1:8787`
- Temporary public pilot ingress is a Cloudflare quick tunnel:
  `https://dare-appearing-notices-defensive.trycloudflare.com`
- Current Zendesk webhook target:
  `https://dare-appearing-notices-defensive.trycloudflare.com/webhooks/zendesk`
- Current Zendesk webhook: `Zendesk to ADO Pilot Webhook (cloudflare quick tunnel)` (`01KPE1WQ42VRSPAK78HP1EHXK2`)
- Current Zendesk trigger: `Zendesk -> ADO Pilot Create [Musa ADO Form Testing]` (`50913782165651`)
- Pilot scope is intentionally narrow:
  form `Musa ADO Form Testing`, tag `ado_sync_pilot`, and only when `ADO Work Item ID` is blank
- The `Musa ADO Form Testing` form is attached to the `Jesta I.S.` brand and visible in the form selector
- Live proof point: Zendesk ticket `#39045` successfully created Azure DevOps Bug `#79741`
- Zendesk writeback for that ticket succeeded, including work item ID, URL, engineering status, sync health, and last sync timestamp
- Oracle also contains the live link and audit record for that sync

## Current Limits

- The Cloudflare quick tunnel is temporary. Its URL may change if the tunnel restarts, which would require updating the Zendesk webhook endpoint.
- `myprojects.jestais.com` is not currently usable for Zendesk webhooks because Zendesk resolves it to private IP `172.16.20.97` and rejects it.
- A direct public-IP fallback to `http://199.243.93.100/...` timed out from Zendesk.
- The deployed service is still one-way for now. Reverse ADO -> Zendesk sync is still pending.
- The Zendesk sidebar app package now exists locally under `zendesk-sidebar-app/`, but it has not yet been installed in Zendesk.
- The sidebar app scaffold already builds and reads the pilot form plus linked-field state, but its create and link actions are not wired to backend app endpoints yet.

## Remaining Work Before Production

- replace the quick tunnel with stable public HTTPS ingress
- install the sidebar app in Zendesk for the pilot form and validate form-gating in Agent Workspace
- add app-facing backend endpoints for summary, create, and link-existing
- implement reverse ADO -> Zendesk status, sprint, and ETA synchronization
- expand the pilot from `Musa ADO Form Testing` to broader support forms after ingress is stable
- add the remaining hardening and operator/replay tooling planned for later phases

## What to deliver

Preferred:

- The generated `release/devazure-zendesk-sync/` folder from `npm run package:standalone`

Alternative:

- This entire project folder, excluding any repo-specific files outside it

## Delivery contents

The standalone package includes:

- `dist/` compiled application files
- `src/` source files
- `.env.example`
- `README.md`
- `package.json`
- `tsconfig.json`

## Delivery steps

```bash
npm run package:standalone
```

After that, hand off the contents of:

```text
release/devazure-zendesk-sync/
```

## Client run steps

```bash
cp .env.example .env
node dist/index.js
```

If the client wants to rebuild from source:

```bash
npm install
npm run build
npm start
```

## Pre-delivery checklist

- Replace placeholder secrets in `.env`
- Confirm stable webhook endpoint URL and HTTPS termination plan
- If the quick tunnel is still being used for pilot traffic, verify the current tunnel URL before testing and update the Zendesk webhook if it changed
- Confirm Zendesk event filters and trigger rules
- Confirm DevAzure work item type and field mappings
- Confirm whether dry-run mode should remain enabled for first deployment
- Confirm when to move the pilot beyond `Musa ADO Form Testing`
