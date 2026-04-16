# SOTA Inventory and Leverage Plan

**Prepared On:** 2026-04-16
**Purpose:** Minimize custom code by identifying battle-tested packages, patterns, and reference architectures before building v1.

## Executive Summary

No production-ready open-source Zendesk-to-Azure DevOps bidirectional sync exists. We build it, but most of the heavy lifting is covered by existing packages and documented patterns.

| Concern | Build vs Buy | Recommendation |
|---|---|---|
| Zendesk API client | **Use package** | `node-zendesk` v6 — ticket fields, comments, webhooks, triggers |
| Azure DevOps types | **Use package types only** | `azure-devops-node-api` — import TypeScript interfaces, keep our own fetch layer |
| Zendesk webhook verification | **Keep ours** | 10-line `crypto.createHmac` — no package needed |
| ADO service hook verification | **Keep ours** | Trivial HMAC-SHA1 — no package exists |
| Oracle connection + queries | **Copy pattern from myreports** | `oracledb` v6.10 thin mode, pool + query/execute helpers |
| Durable job queue | **Build on Oracle** | `SELECT FOR UPDATE SKIP LOCKED` pattern, modeled after yoomoney/db-queue |
| Scheduler | **Use package** | `node-cron` or `bree` for polling/reconciliation triggers |
| Bidirectional sync architecture | **Follow documented pattern** | Truto.one pattern: origin tagging + fingerprint + sync journal + field ownership |
| Loop prevention | **Build** | Origin stamp on writes + fingerprint comparison + dedup key in queue |
| Webhook handler flow | **Follow documented pattern** | Hookdeck pattern: verify → parse → dedup → return 2xx → process async |

## 1. Zendesk: `node-zendesk`

**Package:** `node-zendesk` v6.0.1
**Downloads:** ~65K-94K/week | **Dependents:** 47 | **Maintained:** 10+ years, actively updated
**TypeScript:** Built-in `.d.ts` files
**Dependencies:** Just `cross-fetch`
**Recommended by:** Zendesk's own developer docs

**What it gives us:**
- `client.ticketfields.create/update/list/delete` — create the 10 ADO custom fields
- `client.tickets.update({ comment: { body, public: false } })` — add private notes
- `client.webhooks.create/getSigningSecret` — manage our webhook endpoint
- `client.triggers.create/update/list` — set up escalation triggers
- Full CRUD for attachments, users, groups, organizations

**What it doesn't give us:**
- Webhook signature verification (we keep our `zendesk-signature.ts`)
- Deeply typed webhook/trigger condition bodies (typed as `object`)

**Decision:** Adopt `node-zendesk` for all outbound Zendesk API calls. Eliminates building a ZendeskClient from scratch. Keep our signature verification.

## 2. Azure DevOps: `azure-devops-node-api` (types only)

**Package:** `azure-devops-node-api` v15.1.2
**Maintainer:** Microsoft | **TypeScript:** Native
**Size:** ~4.85 MB unpacked (all services included)

**What it gives us:**
- `JsonPatchOperation`, `WorkItem`, `WorkItemClassificationNode`, `Wiql` — typed interfaces
- Full coverage for work items, WIQL, iterations, classification nodes
- PAT auth patterns

**What it doesn't give us:**
- Service hook management (not in SDK — must use direct REST)
- Service hook payload validation (no package exists)
- Webhook payload TypeScript types for ADO events

**Why types-only:** Our hand-rolled `fetch` + Basic auth approach is simpler and lighter than the SDK's `typed-rest-client` HTTP layer. Importing `import type { ... }` gives type safety without adding a new HTTP dependency.

**Decision:** Add as a dev dependency. Import types to strengthen our `devazure-client.ts`. Keep our fetch-based HTTP layer.

## 3. Oracle: `oracledb` + myreports pattern

**Package:** `oracledb` v6.10.0 (Oracle official)
**Mode:** Thin mode (pure JS, no Oracle Instant Client needed)
**Already proven:** myreports project at `/Users/musaalsalem/Projects/myreports/lib/oracle.ts`

**Pattern to replicate:**
- Lazy singleton connection pool (`poolMin: 2, poolMax: 10`)
- `query<T>()`, `execute()`, `executeMany()` helpers
- `safeExecuteDDL()` for idempotent schema creation (ignores ORA-955, ORA-957, ORA-1408, ORA-1430)
- `healthCheck()` via `SELECT 1 FROM DUAL`
- `closePool()` for graceful shutdown

**Env vars:** `ORACLE_DB_HOST`, `ORACLE_DB_SERVICE`, `ORACLE_DB_USERNAME`, `ORACLE_DB_PASSWORD`
**Connect string format:** `{host}/{service}` (e.g., `srv-db-100/SUPPOPS`)
**Docker:** `extra_hosts` mapping for Oracle hostname resolution, no Instant Client needed in thin mode

**Decision:** Copy the `oracle.ts` pattern from myreports, adapt for this project's needs. First external runtime dependency.

## 4. Job Queue: Oracle-backed with SKIP LOCKED

**Critical finding:** Oracle 19c fully supports `SELECT FOR UPDATE SKIP LOCKED` — the same primitive that powers pg-boss and graphile-worker on PostgreSQL.

**Reference architecture:** yoomoney/db-queue (Java, 252 stars, explicit Oracle support)

**Pattern:**
```
1. Webhook arrives → persist to sync_event table → return 202 immediately
2. Insert sync_job with status=PENDING, next_process_at=NOW
3. Worker polls: SELECT ... WHERE status='PENDING' AND next_process_at<=SYSTIMESTAMP FOR UPDATE SKIP LOCKED
4. Claim: UPDATE status='PROCESSING', worker_id, started_at
5. Execute job (API calls to Zendesk/ADO)
6. Success: UPDATE status='COMPLETED'
7. Failure: UPDATE status='PENDING', attempt_count++, next_process_at = NOW + exponential backoff
8. Max retries exceeded: UPDATE status='DEAD'
```

**Important Oracle caveat:** Do NOT combine `FETCH FIRST N ROWS ONLY` with `FOR UPDATE SKIP LOCKED` — Oracle evaluates the row limit before checking locks. Use cursor fetch-one instead.

**Scheduler:** `node-cron` (lightweight, 1.1M weekly downloads) to trigger polling every N seconds.

**Decision:** Build a thin Oracle-backed queue. No Redis, no external infrastructure. Follow the claim-execute-complete pattern.

## 5. Bidirectional Sync: Truto.one pattern

**Source:** Truto.one architecture guide (best single resource found for this problem)

**Five pillars:**
1. **Origin tagging** — stamp every outbound write with `sync_source='integration'`; skip inbound events from self
2. **Fingerprint comparison** — hash payload fields, compare against stored `last_applied_fingerprint`; skip if unchanged
3. **Sync journal** — per-link metadata: `remote_id`, `local_id`, `last_applied_fingerprint`, `last_source`
4. **Composite dedup key** — `{event_type}:{entity_id}:{timestamp}` checked before processing
5. **Field ownership** — each field designated as Zendesk-owned or ADO-owned; integration only writes in the owner's direction

**Real-time vs repair separation:**
- Webhooks handle fresh changes (event-driven)
- Cron job every 15 minutes sweeps `updatedAt` windows to catch missed events and fix drift

**Decision:** Implement all five pillars. Our `sync_link` table serves as the sync journal. Origin tagging goes in comment bodies and ADO tag conventions. Fingerprinting uses the sync_event dedup_key.

## 6. Comment Sync: espressif pattern

**Source:** espressif/sync-jira-actions (GitHub→Jira, actively maintained)

**Key patterns:**
- **Remote Issue Links with globalID** for loop prevention — check if a link with matching globalID exists before syncing
- **Integration marker** in mirrored comments — stamp author, origin system, timestamp
- **Edit/delete tracking** — detect comment edits and reflect them

**Our adaptation:**
- Zendesk public reply → ADO discussion comment (stamped `[Synced from Zendesk by integration]`)
- ADO discussion → Zendesk private note (stamped `[Synced from Azure DevOps by integration]`)
- `comment_sync_map` table deduplicates: `(source_system, source_comment_id, target_system, target_comment_id)`
- Skip any comment that already contains our integration marker

## 7. Webhook Handler: hookdeck pattern

**Source:** hookdeck/webhook-skills (canonical handler sequence)

**Sequence:**
1. Verify signature
2. Parse payload
3. Check idempotency (dedup_key against sync_event table)
4. Return 2xx immediately
5. Process asynchronously (insert sync_job)

**Dedup TTL:** Must exceed the provider's retry window (Zendesk retries for ~48h)

**Our adaptation:** Already partially implemented. The upgrade is: persist event to `sync_event` before processing, insert `sync_job`, return 202. Worker picks up the job asynchronously.

## Package Adoption Summary

### Add as runtime dependencies
| Package | Version | Purpose |
|---|---|---|
| `oracledb` | ^6.10.0 | Oracle connection pool, queries, thin mode |
| `node-zendesk` | ^6.0.1 | Zendesk API client (fields, tickets, comments, webhooks, triggers) |

### Add as dev dependencies
| Package | Version | Purpose |
|---|---|---|
| `azure-devops-node-api` | ^15.1.2 | TypeScript type imports only (`import type`) |

### Add as runtime dependency (lightweight)
| Package | Version | Purpose |
|---|---|---|
| `node-cron` | ^3.x | Schedule worker polling and reconciliation runs |

### Keep as-is (no package needed)
| Concern | Reason |
|---|---|
| Zendesk webhook signature verification | 10 lines of `crypto.createHmac`, already implemented |
| ADO service hook payload handling | Trivial HMAC-SHA1, no package exists |
| HTTP server | `node:http` is sufficient, no Express/Fastify needed |
| ADO API calls | Our fetch + Basic auth is simpler than the SDK's HTTP layer |

## Reference Repos Worth Bookmarking

| Repo | Stars | Use for |
|---|---|---|
| [yoomoney/db-queue](https://github.com/yoomoney/db-queue) | 252 | Oracle queue table schema and claiming pattern |
| [supabase/stripe-sync-engine](https://github.com/supabase/stripe-sync-engine) | 1,000 | TypeScript webhook-driven sync engine structure |
| [timgit/pg-boss](https://github.com/timgit/pg-boss) | 3,400 | Node.js queue API design to emulate |
| [microsoft/vsts-zendesk-app](https://github.com/microsoft/vsts-zendesk-app) | 37 | Original Microsoft ZD-ADO sidebar app (archived, pattern reference) |
| [espressif/sync-jira-actions](https://github.com/espressif/sync-jira-actions) | 6 | Comment sync with globalID loop prevention |
| [hookdeck/webhook-skills](https://github.com/hookdeck/webhook-skills) | — | Canonical webhook handler sequence |
