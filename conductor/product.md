# DevAzure Zendesk Sync

> Standalone Zendesk <-> Azure DevOps integration for Jestais, delivered as a client-owned Node.js service with Oracle-backed persistence and Linux Docker deployment.

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
| Secure Zendesk webhook intake | implemented | Current starter accepts Zendesk events with signature verification and dry-run support |
| One-way ADO create or update flow | implemented | Current starter creates or updates an Azure DevOps work item using Zendesk ticket metadata |
| Oracle-backed sync ledger and worker model | planned | Target v1 stores events, links, retries, and audit state in Oracle-backed tables |
| Zendesk create vs link-existing workflow | planned | Agents should be able to create a new ADO item or connect an existing one |
| Bidirectional status and sprint sync | planned | Zendesk should surface engineering status, sprint, and ETA fields from ADO |
| Comment and attachment sync policy | planned | Private-note-first comment sync and approved attachment handling |
| Linux Docker deployment package | planned | Dedicated stack beside existing services on the client host |

## Success Metrics

| Metric | Target | Current |
| --- | --- | --- |
| Duplicate work items for the same Zendesk ticket | 0 in steady state | Starter only deduplicates by ADO tag lookup |
| Durable replay and audit coverage | All inbound events persisted | Not implemented yet |
| Zendesk-visible engineering status coverage | Linked tickets show current ADO status, sprint, and ETA | Not implemented yet |
| Deployment fit with client host model | Dedicated Docker stack with loopback bind + Caddy | Not implemented yet |

## Roadmap

- **Phase 0**: Keep the current one-way starter working as a safe baseline.
- **Phase 1**: Add Oracle-backed persistence, worker tables, routing, and v1 field/status sync.
- **Phase 2**: Add richer operator workflows, comment/attachment expansion, and stronger admin surfaces.
