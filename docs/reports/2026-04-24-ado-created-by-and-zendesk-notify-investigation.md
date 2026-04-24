# ADO Created By And Zendesk Notify Investigation

**Date:** 2026-04-24  
**Status:** Recommended direction

## Executive Summary

Two requested behaviors need platform-aware design:

1. True Azure DevOps `System.CreatedBy` can only naturally be the identity whose credential creates the work item. For this integration, the safest v1 production path is to keep the dedicated integration identity and preserve the Zendesk agent as explicit attribution in ADO description, Zendesk notes, and Oracle audit rows. If the client requires the native ADO `Created By` field to be the analyst, the best long-term path is per-agent Microsoft Entra delegated auth, not privileged impersonation.
2. Zendesk Apps Notify can send events to currently open ZAF app instances, but it is not a persistent profile notification inbox. The best durable notification path is native Zendesk ticket updates: internal note + status/tag/custom field + Zendesk trigger/email/follower behavior. Apps Notify can be added as an optional real-time toast when the sidebar is open.

## Sources Checked

- [Microsoft Azure DevOps Work Items Create REST API](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create?view=azure-devops-rest-7.1): `bypassRules`, `suppressNotifications`, `vso.work_write`, and `System.CreatedBy` response behavior.
- [Microsoft Azure DevOps OAuth guidance](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/azure-devops-oauth?view=azure-devops): Microsoft directs new apps to Microsoft Entra ID OAuth; Azure DevOps OAuth app registration is deprecated for new apps.
- [Zendesk Apps API: Notify App](https://developer.zendesk.com/api-reference/ticketing/apps/apps/#notify-app): `POST /api/v2/apps/notify` sends messages to currently open ZAF app instances, can target `agent_id`, is rate-limited, and has a payload cap.
- [Zendesk CCs and followers guidance](https://support.zendesk.com/hc/en-us/articles/5179445630234-Understanding-CCs-and-followers): followers are internal users who receive ticket updates, and standard/custom triggers are the normal Zendesk mechanism for agent notifications.

## Decision 1: ADO Created By

### Current Implementation

- Work items are created by the configured ADO integration credential.
- The acting Zendesk agent is already stamped into:
  - ADO structured description as `Zendesk submitter`
  - ADO discussion comments created from Zendesk where relevant
  - Zendesk internal notes
  - Oracle `AUDIT_LOG.SUMMARY`

### Options

| Option | Description | Pros | Cons | Recommendation |
| --- | --- | --- | --- | --- |
| Keep integration identity + explicit Zendesk attribution | ADO `Created By` remains the service/integration identity; Zendesk user is captured in business/audit fields | Lowest operational risk, least privilege, no per-agent ADO licensing/token lifecycle, strongest non-repudiation for automation | ADO native `Created By` is not the analyst | **Recommended for v1 / production pilot** |
| Per-agent Microsoft Entra delegated auth | Each analyst authorizes ADO access; backend creates work items using the analyst's ADO token | Native ADO `Created By` should be the analyst; aligns with Microsoft direction away from PATs | Requires every analyst to have ADO access/license, login/token UX, secure refresh-token storage, admin consent, failure handling when token expires | **Best if native ADO Created By is non-negotiable** |
| Privileged `bypassRules=true` creation with `System.CreatedBy` set | Integration uses elevated permission to bypass work item rules and set identity fields during create | Can appear to create as another user without per-agent OAuth | High privilege, impersonation/non-repudiation concerns, fragile identity matching, audit/compliance risk | **Not recommended except migration/admin tooling with written ADO IT approval** |
| Per-user PATs | Each analyst provides an ADO PAT | Native ADO identity per user without full OAuth build | Poor secret hygiene, rotation burden, user support burden, contrary to modern auth guidance | **Reject** |

### Recommended Solution

Keep the integration identity for the client pilot and production v1. Add one optional enhancement if the client wants better ADO-side reporting:

- Request ADO process admin to add a text or identity field such as `Custom.ZendeskSubmitter`.
- Write the signed Zendesk actor into that field on create.
- Keep the structured ADO description and Oracle audit rows as the authoritative trace.

If the client insists that the native ADO `Created By` column must show the analyst, plan a v2 Entra delegated-auth workstream:

1. Register an Entra application for the integration.
2. Use auth-code + PKCE popup from the Zendesk app or a backend authorization page.
3. Store refresh tokens encrypted server-side, keyed by Zendesk user ID and ADO identity.
4. Validate the analyst has ADO project/work-item permissions before create.
5. Fall back gracefully when token consent/access is missing.
6. Keep service identity for background sync and only use delegated tokens for user-initiated creates/updates.

Do not use `bypassRules` impersonation for a normal support workflow unless the client explicitly accepts the audit and security trade-off.

## Decision 2: Zendesk Notify

### Current Implementation

- ADO status/comment sync writes Zendesk internal notes.
- ADO status can now map to Zendesk custom status IDs.
- Sidebar Activity shows recent ADO discussion and status.

### What Zendesk Notify Can And Cannot Do

`POST /api/v2/apps/notify` is useful for real-time app events. It can:

- target one agent via `agent_id`
- fire a named event inside the installed ZAF app
- carry a small payload

It cannot be treated as the only notification mechanism because:

- it only reaches currently open app instances
- it is rate-limited
- it is not a durable "profile notification inbox"
- agents who are offline or not viewing an app instance may miss it

### Options

| Option | Description | Pros | Cons | Recommendation |
| --- | --- | --- | --- | --- |
| Native Zendesk internal note + triggers/followers | Continue writing internal notes and let Zendesk trigger/follower/email rules notify assigned agents or followers | Durable, native, searchable, auditable, works when agents are offline | Usually email/trigger based rather than profile-popover based | **Recommended primary path** |
| Hidden custom field/tag + trigger | Add `ado_update_available` tag or hidden field when ADO updates arrive; trigger notifies assignee/group/followers and view can surface tickets needing attention | Durable and reportable, supports custom views and SLA logic | Requires Zendesk trigger/view configuration; tag/field cleanup needs design | **Recommended v1.1 enhancement** |
| Apps Notify toast | Backend calls `/api/v2/apps/notify` for assigned agent; sidebar listens and shows banner/refreshes summary | Nice real-time UX when app is open | Not durable, rate-limited, not a profile inbox | **Optional enhancement only** |
| Marketplace notification app | Use a third-party Zendesk notification app for persistent in-Zendesk alerts/history | Faster than building full notification center | Dependency/cost/admin review | **Evaluate only if native trigger/follower path is insufficient** |
| Build custom notification inbox | Store notifications in Oracle and expose inside sidebar/top-bar app | Fully controlled persistent inbox | More UI, storage, read/unread, cleanup, and security scope | **Later phase, only if client needs an app-owned inbox** |

### Recommended Solution

Use a two-layer approach:

1. **Primary durable notification:** on meaningful ADO update, write an internal note and update a hidden `ADO Update Available` field or tag. Configure Zendesk triggers to notify the ticket assignee and/or followers. This works whether or not the sidebar is open and uses Zendesk's normal notification model.
2. **Optional real-time enhancement:** add Apps Notify for open sessions only. If the app is open for the assigned agent, show a compact banner like "ADO updated: Dev In Progress" with a Refresh action. This improves immediacy without pretending to be durable.

For the client's "Notify section under profile" question: based on current Zendesk APIs, there is no supported general API to insert arbitrary persistent items into that native profile notification list. We should phrase this clearly and offer the native trigger/follower path plus optional in-app toast.

## Proposed Next Build Tasks

1. Add a hidden/tag-based `ADO Update Available` signal when ADO state/comment sync occurs.
2. Add an admin script or runbook snippet to create/update Zendesk triggers:
   - condition: tag/field indicates ADO update
   - action: notify ticket assignee or group/followers
3. Add a sidebar "Latest ADO update" banner when that signal is present.
4. Apps Notify implementation:
   - backend sends event `ado_update_available` when `ZENDESK_APP_NOTIFY_APP_ID` is configured
   - target `agent_id` from ticket assignee when available; skip unassigned tickets rather than broadcasting
   - sidebar listens for ZAF event `api_notification.ado_update_available`, filters by ticket ID, shows a compact banner, and refreshes summary on analyst request
5. If native ADO `Created By` remains mandatory, open a separate v2 Entra delegated-auth design and estimate.

## Recommendation To Client

For the pilot, keep ADO creation under the integration identity with explicit Zendesk submitter attribution. This is the safest and most supportable design. For notifications, rely on Zendesk-native ticket notifications first, with optional sidebar real-time toast. Treat true ADO `Created By` and custom persistent in-app notification inbox as v2 scope because both require meaningful security/product design beyond a field mapping.
