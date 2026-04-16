# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript (src/ -> dist/)
npm run typecheck      # Type-check without emitting
npm run dev            # Watch mode (tsc --watch)
npm run test           # Build + run all tests
npm start              # Run compiled server (dist/index.js)
npm run package:standalone  # Build + create release bundle in release/devazure-zendesk-sync/
```

Tests use Node's built-in test runner (`node --test`). Test files are `.mjs` in `test/` and import from `dist/`, so a build is required before tests run. There is no way to run a single test file other than `node --test test/<file>.test.mjs` (after building).

## Architecture

One-way webhook-driven sync: Zendesk ticket events -> Azure DevOps work items. No runtime dependencies beyond Node built-ins (no Express, no external packages).

**Request flow:** `index.ts` boots the server -> `server.ts` handles HTTP (raw `node:http`) with two routes:
- `GET /health` - health check
- `POST /webhooks/zendesk` - webhook endpoint

Webhook processing pipeline in `server.ts`:
1. Bearer token check (optional, `INBOUND_BEARER_TOKEN`)
2. Zendesk signature verification (`zendesk-signature.ts` - HMAC-SHA256 with timing-safe comparison)
3. Parse event payload (`zendesk-event-parser.ts`)
4. Look up existing work item by `zendesk:id:<ticket-id>` tag via WIQL (`devazure-client.ts`)
5. Build sync plan - create, update, or noop (`sync-planner.ts`)
6. Execute against Azure DevOps REST API or return dry-run response

**Key design decisions:**
- Work item deduplication uses DevAzure tag `zendesk:id:<ticket-id>` queried via WIQL, not a local database
- Destructive Zendesk events (soft_deleted, permanently_deleted, marked_as_spam, merged) are skipped as noop
- `SYNC_DRY_RUN=true` by default - the server returns what it would do without calling DevAzure APIs
- Hyperlink relations to Zendesk tickets are only added on create (not update), and only when `ZENDESK_BASE_URL` is set
- `devazure-client.ts` uses `fetch` with Basic auth (PAT) and JSON Patch (`application/json-patch+json`) for work item operations

## Configuration

All config from environment variables, loaded in `config.ts`. Copy `.env.example` to `.env`. Required vars: `ZENDESK_WEBHOOK_SECRET`, `DEVAZURE_ORG_URL`, `DEVAZURE_PROJECT`, `DEVAZURE_PAT`. Signature verification can be bypassed with `ZENDESK_SKIP_SIGNATURE_VERIFICATION=true` for local testing only.

## TypeScript

- Target: ES2022, ESM modules (`"type": "module"` in package.json)
- Strict mode enabled
- All internal imports use `.js` extensions (TypeScript ESM convention)
- Node >= 24.14.0 required
