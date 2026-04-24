# DevAzure Zendesk Sync

> Standalone Zendesk ↔ Azure DevOps integration for Jestais, delivered as a client-owned Node.js service with Oracle-backed persistence and Linux Docker deployment.

## Problem

Support teams work in Zendesk while engineering teams work in Azure DevOps. Important escalations currently risk losing context, routing consistency, auditability, and status visibility when they are moved manually between systems.

## Solution

Build a standalone integration service that:

- accepts Zendesk and Azure DevOps events
- creates or links Azure DevOps work items from Zendesk
- syncs selected status, sprint, ETA, comment, and attachment data back into Zendesk
- stores durable integration state in Oracle
- runs on the client's existing Linux Docker host without depending on MusaOS runtime code

## Target Users

| Persona | Needs | Pain Points |
| --- | --- | --- |
| Support agents | Create or link engineering work without leaving Zendesk | Manual handoff is slow and loses status visibility |
| Engineering teams | Receive well-routed, well-described work items in Azure DevOps | Tickets arrive without consistent product, routing, or context |
| Support operations | Track sync health and enforce consistent workflow | Integrations are hard to audit when state is not durable |
| Delivery / implementation team | Build and deploy a maintainable standalone service | Discovery findings and design decisions are spread across multiple docs |

## Core Features

| Feature | Status | Description |
| --- | --- | --- |
| Secure Zendesk webhook intake | implemented | HMAC-verified endpoint, 1 MB body cap, dedup via `SYNC_EVENT.DEDUP_KEY` unique constraint |
| One-way ADO create or update flow | implemented | Durable worker pulls from `SYNC_JOB`; routing matrix + required ADO fields applied |
| Oracle-backed sync ledger and worker model | implemented | 8 tables (`SYNC_LINK`, `SYNC_EVENT`, `SYNC_JOB`, `SYNC_ATTEMPT`, `AUDIT_LOG`, `COMMENT_SYNC_MAP`, `ATTACHMENT_SYNC_MAP`, `ITERATION_CACHE`); thin-mode driver; `FOR UPDATE SKIP LOCKED` claim pattern |
| Zendesk custom field contract | implemented | Compact integration-owned ADO projection fields live in tenant; sidebar is the primary analyst view |
| Bidirectional status and sprint sync | implemented and live-verified | ADO service-hook + reconciler both enqueue `sync_ado_state_to_zendesk`; fingerprint guard skips no-op writes |
| Linux Docker deployment package | deployed (temporary public tunnel) | Stack live on `ubuntu-docker-host`; Oracle + worker healthy; stable DNS/443 remains blocked on IT |
| Zendesk sidebar workspace | pilot-ready | Private app creates, links, unlinks, shows live ADO summary/activity/update tabs, and attributes actions to Zendesk agents |
| Comment and attachment sync policy | implemented and live-smoked | Public replies and private `#sync` notes sync to ADO; ADO discussions sync back as internal notes; Zendesk attachments upload to ADO with dedupe |
| Operator endpoints + observability | partially implemented | Health/readiness, token-protected dead-job list and retry endpoints, worker/reconciler logs; structured log sink still future |

## Success Metrics

| Metric | Target | Current |
| --- | --- | --- |
| Duplicate work items for the same Zendesk ticket | 0 in steady state | `SYNC_LINK` unique index on `ZENDESK_TICKET_ID` where `IS_ACTIVE=1` enforces this (live-data N=0 so far) |
| Durable replay and audit coverage | All inbound events persisted | `SYNC_EVENT` + `SYNC_JOB` + `SYNC_ATTEMPT` + `AUDIT_LOG` all populated by every handler |
| Zendesk-visible engineering status coverage | Linked tickets show current ADO status, sprint, and ETA | Implemented and live-verified; readiness smoke covered Zendesk #39235 / ADO #79943 |
| Deployment fit with client host model | Dedicated Docker stack with loopback bind + Caddy | Container live on host; pilot uses Cloudflare quick tunnel and tunnel guardian until Caddy public URL is approved |

## Roadmap

- **Phase 0**: Keep the current one-way starter working as a safe baseline. **Done** — `BASE-001`.
- **Phase 1**: Oracle persistence + worker. **Done** — `APP-001`.
- **Phase 2**: Zendesk custom fields + outbound API client. **Done** — `APP-001b`.
- **Phase 3**: Routing matrix + durable create flow. **Done** — `APP-002`.
- **Phase 4**: Reverse sync (ADO → Zendesk). **Done and live-verified** — `APP-003`.
- **Phase 5**: Docker deployment package. **Done; deployed to host, pending public URL** — `OPS-001`.
- **APP-005**: Sidebar app create/link/unlink/comment workspace. **Pilot-ready and live-smoked**.
- **Phase 6**: Comment/attachment sync and relink audit trail. **Implemented and live-smoked** — `APP-004`.
- **HARDEN-001**: Observability + operator endpoints + replay protection. **Partially implemented; structured logs/kill switch future**.
