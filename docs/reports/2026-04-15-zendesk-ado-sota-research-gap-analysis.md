# Zendesk Azure DevOps SOTA Research And Knowledge Gap Analysis

**Prepared On:** 2026-04-15  
**Status:** Research-backed recommendation  
**Purpose:** Compare current integration products and platform patterns, identify battle-tested components we can reuse, and confirm the best implementation approach for the client project.

## 1. Research Question

Before implementation, we wanted to answer:

- What mature Zendesk-Azure DevOps integration patterns already exist?
- Which parts should be bought, adopted, or copied as patterns instead of reinvented?
- Which tools and technologies best fit a client-owned standalone deployment on an existing Linux Docker host?
- What knowledge gaps remain before implementation starts?

## 2. Executive Conclusion

The strongest recommendation is still a **custom standalone integration service**, but it should **not** be written as a greenfield invention from scratch.

We should reuse battle-tested parts and patterns:

- Zendesk webhooks and the Zendesk Apps Framework sidebar model
- Azure DevOps service hooks and work item REST APIs
- a durable job/retry layer instead of hand-rolled retry loops
- a real persistence layer for sync ledger, replay, and audit
- patterns already validated by mature products: create, connect existing, sync panel, private-note-first comment handling, attachment sync, field mapping, and explicit sync status visibility

The best-fit architecture for this project is:

- **custom Node/TypeScript service**
- **Dockerized standalone deployment**
- **database-backed persistence using the client’s existing enterprise database where practical**
- **a durable database-native queue/job orchestration pattern instead of hand-built retries**
- **Zendesk fields plus private notes in v1**
- **optional Zendesk sidebar app in phase 2**

Important tenant-specific override:

- when no client database preference is known, PostgreSQL is the cleanest general recommendation
- for this client, if an existing Oracle database is available and approved for use, **Oracle becomes the better operational fit**
- in that case, the preferred path becomes **Oracle + node-oracledb + Oracle-native queueing or Oracle-backed worker tables**, not PostgreSQL + `pg-boss`

Live Oracle validation update from 2026-04-15:

- VPN-enabled connectivity to `srv-db-100:1521/SUPPOPS` succeeded
- the `AUTOMATION` schema authenticated successfully
- database version is `Oracle Database 19c Standard Edition 2`
- queue catalog views are visible, but no user queues are configured in the schema
- `DBMS_AQADM` is not currently callable from the schema

Current client-specific implication:

- Oracle-backed worker tables are now the most realistic v1 default
- Oracle AQ remains a valid later enhancement only if the DBA team explicitly enables it

## 3. What Current Systems Already Do

## 3.1 Zendesk Marketplace Azure DevOps Apps

Official Zendesk Marketplace listings show that existing Azure DevOps apps commonly provide:

- create new work items from Zendesk
- link existing work items
- search work items from Zendesk
- notify linked work items
- status sync
- comment sync
- attachment sync
- field mapping
- multiple linked work items per ticket in some products
- history or panel-style views inside Zendesk

What this tells us:

- our planned `Create` and `Link Existing` workflow is standard
- our plan to show engineering status directly in Zendesk is validated
- syncing comments, attachments, and field mappings is not exotic
- the common UX pattern is a **ticket-side panel**, not a separate external tool

Important note:

- Marketplace apps clearly validate the product need and pattern, but they do not solve the client’s requirement for a standalone client-owned deliverable with client-specific routing and controlled deployment

## 3.2 Exalate

Exalate is the strongest example of a mature cross-system sync product in this space.

Observed patterns from official docs:

- explicit **create/sync** and **connect existing** actions
- a **sync status panel** inside the host product
- progress visibility for the sync
- scriptable incoming and outgoing mapping
- advanced field transformation with a scripting engine
- platform-specific sync rules and connection setup

What this tells us:

- our create-vs-link split is the right model
- a sync-status surface inside Zendesk is a proven pattern
- scriptable mappings are important once edge cases appear
- exposing sync state to admins or support operations is worth building

Important note:

- Exalate is a good benchmark for behavior and operator experience
- it is also a reminder that highly flexible sync products become rule engines, which is useful but can add significant operational and licensing overhead

## 3.3 Unito

Unito’s official docs reinforce a few strong patterns:

- webhook-driven near-real-time sync is preferred where supported
- internal Zendesk notes are the default comment behavior
- public Zendesk replies are opt-in, not default
- permissions and webhook setup matter as much as field mapping

What this tells us:

- our preference for private notes first is aligned with a mature integration pattern
- webhook support is important for responsiveness, but polling fallback still matters for platforms or events without webhook coverage
- the comment policy should be explicit, not implicit

## 3.4 Power Automate / Logic Apps

Microsoft’s official connectors prove that low-code automation can connect both systems, but the documented limitations are important:

- Zendesk connector returns only atomic properties for some entities
- Zendesk connector has trigger limitations around `updated_at`
- Zendesk change triggers can fire shortly after ticket creation
- Azure DevOps connector can miss some fields in trigger/detail responses
- Azure DevOps connector’s update and detail flow often needs fallback to direct HTTP requests
- Azure DevOps work item updated trigger skips link-only changes

What this tells us:

- low-code can work for simple workflows
- but for this project’s field fidelity, routing logic, sprint-date handling, and audit/replay needs, Power Automate or Logic Apps would still force us into custom HTTP and compensating logic
- that means we would still own the hard parts, but inside a less transparent runtime

## 3.5 Workato

Workato officially supports Zendesk and advertises Azure DevOps-Zendesk integration, but the integration listing indicates that Azure DevOps connectivity is available through the HTTP connector rather than a rich dedicated Azure DevOps connector.

What this tells us:

- Workato is viable if the client wants a managed enterprise iPaaS
- it does not eliminate the need for custom API design and mapping
- it adds licensing and platform dependency that work against the “client-owned standalone service” requirement

## 4. What The Official Platforms Themselves Already Give Us

## 4.1 Zendesk Platform Capabilities

Official Zendesk docs confirm:

- webhook signatures can be verified with HMAC over timestamp plus body
- webhooks can be used for triggers, automations, or event subscriptions
- ticket sidebar and new-ticket sidebar apps are first-class UI locations
- sidebar apps can listen to ticket changes, custom field changes, ticket updates, and save hooks
- sidebar apps can participate in `ticket.save` validation and gating

What we should leverage:

- **webhooks** for outbound Zendesk eventing
- **ticket sidebar app** if we need stronger UX or controlled read-only display
- **ticket.save hook** if we later want to enforce rules such as “must create or link ADO item before certain support transitions”

## 4.2 Azure DevOps Platform Capabilities

Official Microsoft docs confirm:

- service hooks can send Azure DevOps events to generic webhooks over HTTP
- work item comments can be added through the REST API in Markdown or HTML formats
- work item attachments can be uploaded via REST, including chunked upload for larger files
- classification node APIs return iteration and area metadata, including dated iterations
- service hooks and work item APIs are already designed to support integration scenarios

What we should leverage:

- **service hooks -> webhook consumer** for work item changes
- **work item comment API** for private-note mirroring or notify flows
- **attachment API** if attachment sync is approved in v1 or v2
- **classification node APIs** for sprint-date enrichment and ETA

## 5. Build Vs Buy Assessment

## Option A: Use a Zendesk Marketplace Azure DevOps App

### Pros

- fastest path to basic create/link/status features
- proven in-product Zendesk UX
- likely covers many common support-dev workflows

### Cons

- client does not receive a standalone owned deliverable
- routing, custom status detail, and reporting logic may be constrained
- hard to control long-term deployment, secrets, and observability
- vendor dependency becomes part of the client handoff

### Conclusion

- not a fit for the delivery model, even if the UX patterns are useful

## Option B: Use Exalate Or Unito

### Pros

- battle-tested sync engines
- explicit connect/sync patterns
- webhook-first thinking
- field mapping support

### Cons

- introduces another product to buy, operate, and govern
- still less client-owned than a standalone deliverable
- mapping logic lives in another vendor’s platform
- operational portability and future client handoff are weaker

### Conclusion

- excellent reference implementations
- not the best final delivery model for this client requirement

## Option C: Use Power Automate / Logic Apps / Workato / n8n

### Pros

- fast to prototype
- built-in retry tools or workflow tooling
- useful for simple event plumbing

### Cons

- connector limitations become a problem for rich field fidelity
- comment/status/attachment/sprint logic still requires custom handling
- complex bidirectional sync becomes harder to reason about
- self-hosting and client handoff are less clean, especially for commercial iPaaS

### Conclusion

- suitable for prototypes or narrow automations
- not the best home for the full client deliverable

## Option D: Custom Standalone Service Using Official Platform APIs

### Pros

- fully client-owned deliverable
- exact control over routing, mapping, audit, and replay
- easiest to align to the client’s Linux Docker host
- easiest to evolve with future business rules
- can still reuse official platform primitives instead of reinventing them

### Cons

- we own support and maintenance
- we must choose and operate our own worker and persistence layer
- initial implementation is slower than buying a marketplace app

### Conclusion

- best overall fit

## 6. Technology Decision Analysis For The Custom Service

## 6.1 API And Runtime

Recommended:

- **Node.js + TypeScript**

Reasoning:

- already aligned to the existing starter
- good fit for webhook consumers, HTTP APIs, and REST-heavy integrations
- good fit for Zendesk sidebar apps if we build one later
- straightforward Docker deployment on the existing Linux host

## 6.2 Web Layer

Recommended:

- keep the integration as a dedicated HTTP service with raw-body access for Zendesk signature verification

Reasoning:

- Zendesk signature verification depends on exact request body handling
- the service needs both public webhook endpoints and internal admin/health endpoints
- this is a standard daemon-style service, not a serverless-only shape

## 6.3 Persistence

Recommended:

- **Use the client’s existing enterprise database when it is operationally approved**

Current client-specific recommendation:

- **Oracle**

Reasoning:

- we need a durable sync ledger
- we need retry bookkeeping
- we need replay and audit history
- we likely want structured admin queries later
- Oracle is already part of the client environment and reduces new operational footprint
- PostgreSQL remains a strong generic recommendation when no Oracle option exists

Important note:

- this is now a client-specific preference, not only a generic recommendation
- if Oracle access is approved, prefer Oracle over introducing PostgreSQL just for this integration
- if Oracle access is delayed or constrained, SQLite remains a viable thin-pilot fallback

## 6.4 Worker / Retry / Scheduling

Candidates considered:

- Temporal
- Inngest
- BullMQ
- PostgreSQL-native queue patterns

### Temporal

Best for:

- very high durability requirements
- long-running workflow orchestration
- deeply stateful business processes

Why not recommended here:

- operationally heavy for the size of this integration
- excellent technology, but likely too much system for this project

### Inngest

Best for:

- event-driven durable functions with dashboarding and retries
- fast self-hosted experimentation

Why not recommended as the primary choice:

- self-hosting is supported, but direct support for self-hosted instances is not guaranteed in the standard path
- it adds a dedicated workflow platform that the client may not need

### BullMQ

Strengths from official docs:

- mature Node/Redis queue
- retries
- job schedulers / repeatable jobs
- idempotent job patterns
- automatic crash recovery

Why it is not the top recommendation:

- requires Redis
- still leaves us needing a second durable store for ledger and audit
- adds one more infrastructure dependency than we may need

### PostgreSQL-native queue pattern

Strongest candidate:

- **pg-boss**, a PostgreSQL-backed Node job queue

Why it fits:

- PostgreSQL-backed background processing
- reliable asynchronous execution
- exactly-once delivery claims based on PostgreSQL locking semantics
- lets us unify queue durability and app data on one database technology

Recommendation:

- prefer a **PostgreSQL-backed worker pattern** for this project
- if we choose Postgres for the ledger, use a Postgres-native queue instead of adding Redis unless we find a compelling scale reason later

This recommendation is an inference from the official and primary-source tool docs plus the client deployment shape.

### Oracle-native queue pattern

Strongest Oracle-native candidates:

- **Oracle Advanced Queuing (AQ) classic**
- **Oracle Transactional Event Queues (TxEventQ)** where version and mode support are compatible

Why this fits:

- queueing is built into Oracle Database
- node-oracledb exposes enqueue and dequeue APIs directly
- Oracle queueing is mature and battle-tested
- it avoids adding Redis or a second queue platform when Oracle is already approved

Important implementation note from the official node-oracledb docs:

- TxEventQ is supported in node-oracledb Thick mode
- the same node-oracledb APIs are used for TxEventQ and classic AQ
- AQ notifications are Thick-mode only

Practical recommendation:

- if the client DBA team can provision AQ or TxEventQ and grant the required rights, prefer an **Oracle-native queue**
- if AQ permissions or database version constraints make that too heavy for v1, use **Oracle-backed job tables plus worker polling** as the fallback

This is now the preferred client-specific path.

## 6.5 Authentication

### Zendesk

Official docs support both:

- API tokens
- OAuth access tokens

Recommended approach:

- because this is an **internal client-owned integration**, a Zendesk API token is acceptable for v1
- longer term, a local OAuth client with refresh tokens is cleaner if the client wants better governance and easier rotation

### Azure DevOps

Official Microsoft guidance now points in a more security-focused direction:

- Azure DevOps OAuth is deprecated for new app registrations
- Microsoft recommends Microsoft Entra ID OAuth for new applications
- global PATs are being retired
- PAT best practices favor scoped and well-managed tokens

Recommendation:

- avoid legacy Azure DevOps OAuth
- avoid global PATs
- if the client can support it operationally, prefer a Microsoft Entra-based auth flow for the long term
- if speed and simplicity matter most for v1, use an **organization-scoped PAT owned by a dedicated integration identity**

This is a practical recommendation based on official Microsoft direction plus current delivery constraints.

Live tenant update from direct org inspection:

- the current working user `malsalem@jestais.com` is confirmed at `Basic`
- visible memberships show project-contributor style access, not top org-admin access
- direct extended-user reads required `ReadExtended Users`, which is another sign the current user is not at the highest admin tier

Later live update on 2026-04-15:

- `malsalem@jestais.com` was re-checked and is now confirmed in `[jestaisinc]\\Project Collection Administrators`
- a direct project-creation probe succeeded, which confirms collection-admin style project-creation capability
- the entitlement endpoint still did not return a clean upgraded access-level read through the CLI path, so the admin-role change is more strongly confirmed than the exact paid license tier

Current client provisioning decision:

- request a dedicated Azure DevOps integration identity with:
  - `Basic + Test Plans` or `Visual Studio Enterprise`
  - `Project Collection Administrators`

This is broader than least-privilege runtime access, but it matches the stated future goal of using the same integration identity for project creation, user-related automation, and test-plan operations.

## 7. Final Architecture Recommendation

Recommended v1 stack:

- **Custom standalone Node/TypeScript service**
- **Docker container on the client’s Linux host**
- **Official Zendesk webhook + official Azure DevOps service hook model**
- **Oracle for sync ledger and audit when approved by the client DBA team**
- **Oracle-native durable queue pattern where possible, else Oracle-backed worker tables**
- **Zendesk fields plus private notes in v1**
- **Optional sidebar app in phase 2**

Recommended v1 product behavior:

- Create ADO bug from Zendesk
- Link existing ADO item by ID or URL
- Sync `ADO Status`
- Sync `ADO Status Detail`
- Sync sprint name and sprint dates
- Sync ETA
- Mirror meaningful engineering updates as Zendesk private notes

## 8. What We Should Reuse Instead Of Reinventing

Use as-is from official platforms:

- Zendesk webhook authenticity pattern
- Zendesk sidebar app locations and events
- Azure DevOps service hooks
- Azure DevOps comments API
- Azure DevOps attachments API
- Azure DevOps classification node APIs for sprint dates

Use as design patterns from mature products:

- explicit **Create** vs **Connect existing**
- sync panel / sync state visibility
- private-note-first sync policy
- opt-in public comment sync
- progress and retry visibility

Use as implementation building blocks:

- Oracle
- node-oracledb
- Oracle AQ / TxEventQ where available
- Oracle-backed worker tables as fallback
- Dockerized single-service deployment with separate worker process or mode

## 9. Knowledge Gap Analysis

| Gap | Why It Matters | Current Risk | Recommended Next Action |
| --- | --- | --- | --- |
| Final ADO auth model | Affects security, token rotation, and deployment simplicity | Medium | Decide between org-scoped PAT for v1 and Microsoft Entra for target state |
| Elevated Azure DevOps integration-user provisioning | Needed because the client wants the integration identity to support future project, user, and test-plan administration | Medium | Ask IT to provision `Basic + Test Plans` or `Visual Studio Enterprise` plus `Project Collection Administrators` |
| Oracle queueing model | Determines whether we use AQ/TxEventQ or worker tables | Medium | Verify Oracle version, privileges, and DBA willingness to provision AQ |
| Service hook create/manage permission | Needed for ADO -> integration push model | Medium | Verify create subscription rights in the target project |
| Zendesk field creation and final form placement | Needed to expose `ADO *` fields cleanly | Low | Create fields in sandbox/admin and test agent UX |
| True read-only UX for agents | Affects whether fields alone are enough | Medium | Validate native field behavior; build sidebar app only if needed |
| Final routing for `BI`, `Reports`, `Ecomm`, `Planning`, `Planning.net` | Needed to avoid misrouting new work items | High | Business review and ownership confirmation |
| Attachment policy | Affects storage, payload size, and permission scope | Medium | Decide whether attachment sync is v1 or phase 2 |
| Exact comment policy | Prevents noise and loopbacks | Medium | Lock public/private sync rules and stamps |
| Replay / admin tooling | Needed for operational support after go-live | Medium | Define minimal admin endpoints and replay model |
| Subdomain / ingress path | Needed for webhook registration | Low | Confirm deployment DNS and reverse-proxy route |
| Multi-work-item support | Existing products support it, but v1 may not need it | Medium | Confirm whether v1 supports one primary ADO link or multiple |

## 10. Final Reflection On Our Current Design

The research largely **confirms** the design direction we have already been shaping.

What it validates:

- standalone service is the right delivery model
- create vs link existing is the right interaction model
- Zendesk-side visibility fields are the right v1 surface
- private notes are the right detailed-history surface
- sprint and ETA visibility are worth making first-class
- curated routing is better than exposing the raw ADO area tree

What it changes or sharpens:

- we should lean even harder on official platform primitives and avoid low-code lock-in
- we should avoid legacy Azure DevOps OAuth and global PATs
- we should prefer a durable queue pattern instead of hand-built retry loops
- for this tenant, Oracle can now replace PostgreSQL as the primary persistence recommendation if DBA access is available
- the current human user is not the final production identity we should design around
- the Azure DevOps integration identity must now be documented as a provisioned elevated account, not merely a low-privilege runtime account

## 11. Recommended Next Step

Before coding the production implementation, update the project docs one final time to reflect:

- custom standalone service is confirmed
- Oracle is preferred when the client provides an approved Oracle database
- Oracle-native durable queueing is preferred when AQ or TxEventQ can be provisioned
- Oracle-backed worker tables are the fallback if AQ is not practical for v1
- `ADO Status Detail` is part of v1
- private notes are the detailed update channel
- unresolved routing families remain a business-decision gate

## 12. Sources

- Zendesk Marketplace Azure DevOps app: [zendesk.com/marketplace/apps/support/394508/azure-devops-integration](https://www.zendesk.com/marketplace/apps/support/394508/azure-devops-integration/)
- Zendesk Marketplace IntegrateCloud Azure DevOps app: [zendesk.com/marketplace/apps/support/853426/azure-devops-by-integratecloud-free](https://www.zendesk.com/marketplace/apps/support/853426/azure-devops-by-integratecloud-free/)
- Zendesk webhook anatomy: [developer.zendesk.com/documentation/webhooks/anatomy-of-a-webhook-request/](https://developer.zendesk.com/documentation/webhooks/anatomy-of-a-webhook-request/)
- Zendesk webhook verification: [developer.zendesk.com/documentation/webhooks/verifying/](https://developer.zendesk.com/documentation/webhooks/verifying/)
- Zendesk Apps Framework getting started: [developer.zendesk.com/documentation/apps/app-developer-guide/getting_started/](https://developer.zendesk.com/documentation/apps/app-developer-guide/getting_started/)
- Zendesk ticket sidebar API: [developer.zendesk.com/api-reference/apps/apps-support-api/ticket_sidebar/](https://developer.zendesk.com/api-reference/apps/apps-support-api/ticket_sidebar/)
- Zendesk API authentication: [developer.zendesk.com/documentation/api-basics/authentication/using-the-api-with-2-factor-authentication-enabled/](https://developer.zendesk.com/documentation/api-basics/authentication/using-the-api-with-2-factor-authentication-enabled/)
- Zendesk OAuth refresh tokens: [developer.zendesk.com/documentation/api-basics/authentication/refresh-token/](https://developer.zendesk.com/documentation/api-basics/authentication/refresh-token/)
- Azure DevOps service hooks overview: [learn.microsoft.com/en-us/azure/devops/service-hooks/overview](https://learn.microsoft.com/en-us/azure/devops/service-hooks/overview?view=azure-devops)
- Azure DevOps work item comments API: [learn.microsoft.com/en-us/rest/api/azure/devops/wit/comments/add-work-item-comment](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/comments/add-work-item-comment?view=azure-devops-rest-7.1)
- Azure DevOps attachments API: [learn.microsoft.com/en-us/rest/api/azure/devops/wit/attachments/create](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/attachments/create?view=azure-devops-rest-7.1)
- Azure DevOps classification nodes API: [learn.microsoft.com/en-us/rest/api/azure/devops/wit/classification-nodes/get](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/classification-nodes/get?view=azure-devops-rest-7.1)
- Azure DevOps connector limitations in Power Automate / Logic Apps: [learn.microsoft.com/en-us/connectors/visualstudioteamservices/](https://learn.microsoft.com/en-us/connectors/visualstudioteamservices/)
- Zendesk connector limitations in Power Automate / Logic Apps: [learn.microsoft.com/en-us/connectors/zendesk/](https://learn.microsoft.com/en-us/connectors/zendesk/)
- Workato Zendesk connector: [docs.workato.com/connectors/zendesk](https://docs.workato.com/connectors/zendesk)
- Workato Azure DevOps + Zendesk integration: [workato.com/integrations/azure-devops~zendesk](https://www.workato.com/integrations/azure-devops~zendesk)
- Exalate connection setup: [docs.exalate.com/docs/create-connection-console](https://docs.exalate.com/docs/create-connection-console)
- Exalate scripting engine: [docs.exalate.com/docs/exalate-api-reference-documentation](https://docs.exalate.com/docs/exalate-api-reference-documentation)
- Exalate sync panel and connect/create pattern: [docs.exalate.com/docs/manual-synchronization-zendesk](https://docs.exalate.com/docs/manual-synchronization-zendesk)
- Unito webhook support: [guide.unito.io/unito-webhook-support](https://guide.unito.io/unito-webhook-support)
- Unito Zendesk public replies pattern: [guide.unito.io/how-to-sync-zendesk-public-replies](https://guide.unito.io/how-to-sync-zendesk-public-replies)
- Unito Zendesk permissions: [guide.unito.io/every-user-permission-unito-needs](https://guide.unito.io/every-user-permission-unito-needs)
- BullMQ overview: [docs.bullmq.io](https://docs.bullmq.io/)
- BullMQ retries: [docs.bullmq.io/guide/retrying-failing-jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)
- BullMQ job schedulers: [docs.bullmq.io/guide/job-schedulers](https://docs.bullmq.io/guide/job-schedulers)
- BullMQ idempotent jobs: [docs.bullmq.io/patterns/idempotent-jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- Inngest self-hosting: [inngest.com/docs/self-hosting](https://www.inngest.com/docs/self-hosting)
- Inngest retries: [inngest.com/docs/features/inngest-functions/error-retries/retries](https://www.inngest.com/docs/features/inngest-functions/error-retries/retries)
- Temporal overview: [docs.temporal.io](https://docs.temporal.io/)
- pg-boss primary source: [github.com/timgit/pg-boss](https://github.com/timgit/pg-boss)
- node-oracledb overview: [oracle.github.io/node-oracledb/](https://oracle.github.io/node-oracledb/)
- node-oracledb AQ guide: [node-oracledb.readthedocs.io/en/latest/user_guide/aq.html](https://node-oracledb.readthedocs.io/en/latest/user_guide/aq.html)
- Azure DevOps PAT guidance: [learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate](https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops)
- Azure DevOps OAuth deprecation and guidance: [learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/oauth](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/oauth?view=azure-devops)
- Azure DevOps global PAT retirement: [learn.microsoft.com/en-us/azure/devops/release-notes/2026/sprint-270-update](https://learn.microsoft.com/en-us/azure/devops/release-notes/2026/sprint-270-update)
