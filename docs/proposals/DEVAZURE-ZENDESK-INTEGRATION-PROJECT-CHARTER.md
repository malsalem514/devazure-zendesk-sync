# DevAzure Zendesk Integration Project Charter

**Document Owner:** Musa Al Salem  
**Prepared On:** 2026-04-15  
**Status:** Historical starter draft  
**Project Type:** Integration service  
**Default Direction:** Zendesk ticket events -> DevAzure work items  

> Note: this document reflects the earliest starter direction only. The current authoritative design has evolved into a standalone Zendesk-Azure DevOps integration with Oracle-backed persistence, richer bidirectional sync, sprint visibility, and client-specific routing. Use these documents for current design and implementation work:
>
> - [ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md](./ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md)
> - [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
> - [2026-04-15-zendesk-ado-sota-research-gap-analysis.md](../reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md)

## 1. Executive Summary

This project establishes a new integration service between Zendesk and DevAzure so that support signals can move into engineering execution without manual copy-paste.

The starter implementation assumes Zendesk remains the support-facing source of truth while DevAzure becomes the engineering delivery surface for investigation, triage, and remediation. The integration starts as a webhook-driven one-way sync and is intentionally scoped to be safe, observable, and easy to extend.

## 2. Problem Statement

- Support teams work in Zendesk while engineering teams work in DevAzure.
- Escalated tickets can be delayed or lose context when they are re-entered manually.
- Ticket priority, tags, and customer impact details are not consistently preserved when handed off.
- Manual handoff makes reporting and SLA tracking harder.

## 3. Mission

Create a production-ready integration path that turns high-value Zendesk ticket events into actionable, traceable DevAzure work items with enough metadata for engineering teams to act quickly.

## 4. Initial Scope

In scope:

- Secure Zendesk webhook intake
- Request authenticity verification
- Ticket-event parsing
- Deterministic DevAzure lookup by Zendesk ticket ID
- DevAzure work item create or update flow
- Dry-run mode for rollout safety
- Starter documentation and local validation

Out of scope for the starter:

- Bidirectional sync
- Comment mirroring in both directions
- Attachment synchronization
- Multi-tenant routing
- Persistent sync ledger beyond DevAzure tag lookup
- Deployment automation

## 5. Success Criteria

- A Zendesk ticket event can be received and verified successfully.
- A repeat event for the same ticket updates the same DevAzure work item instead of creating duplicates.
- Ticket title, status, priority, and context are visible inside the DevAzure work item.
- Destructive Zendesk events are safely ignored until explicit policy is defined.
- The service can run in dry-run mode for safe validation.

## 6. Default Mapping

- Zendesk ticket ID -> DevAzure tag `zendesk:id:<ticket-id>`
- Zendesk subject -> `System.Title`
- Zendesk description, key metadata, and sidebar handoff sections -> `System.Description`
- Sidebar handoff sections -> supported native ADO fields where available, including Bug repro steps/system info/final result and shared acceptance criteria
- Zendesk priority -> `Microsoft.VSTS.Common.Priority`
- Zendesk status and tags -> `System.Tags`
- Zendesk ticket URL -> DevAzure hyperlink relation when base URL is configured

## 7. Architecture

```text
Zendesk Ticket Event
  -> HTTPS webhook
  -> signature verification
  -> event parser
  -> sync planner
  -> DevAzure lookup by ticket tag
  -> create or update work item
```

## 8. Delivery Phases

### Phase 1: Starter

- Create a standalone workspace app
- Implement webhook verification
- Implement DevAzure work item create and update
- Ship dry-run validation path

### Phase 2: Operational Hardening

- Add structured logs
- Add retry and dead-letter handling
- Add deployment target and secret loading
- Add richer routing by brand, group, or ticket form

### Phase 3: Workflow Expansion

- Sync public comments
- Add reverse status sync from DevAzure to Zendesk
- Add analytics or reporting hooks

## 9. Risks

- Zendesk events can be noisy if trigger rules are not carefully filtered.
- DevAzure field configuration varies across organizations and may require per-project mapping.
- Duplicate handling by tag lookup is a pragmatic starter, but a dedicated ledger will be safer for long-term scale.
- Support workflows often need policy decisions for merged, deleted, or spam-marked tickets.

## 10. Implementation Note

The current implementation is being developed in a larger repository, but the delivered integration must remain a standalone service with no client-facing dependency on any internal platform, branding, or runtime. The package should be handoff-ready as an independent Node service.
