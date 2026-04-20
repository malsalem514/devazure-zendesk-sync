# DevAzure Zendesk Sync

Standalone Zendesk <-> Azure DevOps integration for Jestais, with a Node/TypeScript backend service and a scaffolded private Zendesk sidebar app package.

## Project Context

The repository currently contains a safe starter implementation, but the target client deliverable is broader than the starter code alone.

For implementation work, start with:

- [docs/README.md](./docs/README.md) for the document index and canonical read order
- [conductor/product.md](./conductor/product.md) for product scope
- [conductor/tech-stack.md](./conductor/tech-stack.md) for current vs target architecture
- [conductor/workflow.md](./conductor/workflow.md) for document precedence and working rules
- [conductor/tracks.md](./conductor/tracks.md) for the current workstream list

## Current assumption

The repo now contains two complementary parts:

- `src/` -> the live backend integration service
- `zendesk-sidebar-app/` -> the private Zendesk sidebar app package

The current live backend is still a safe one-way baseline plus Zendesk field writeback, while the target v1 deliverable is broader:

- Zendesk remains the support-facing source of truth
- Azure DevOps remains the engineering execution system
- agents should ultimately use the sidebar app as the primary create/link/status UX
- reverse ADO -> Zendesk sync, stable ingress, and app-facing backend endpoints are still pending

## What is included

- Raw HTTP webhook endpoint for Zendesk
- Zendesk signature verification using `X-Zendesk-Webhook-Signature` and `X-Zendesk-Webhook-Signature-Timestamp`
- DevAzure work item lookup by deterministic Zendesk tag
- Create-or-update work item flow
- Mapping layer that turns a Zendesk ticket event into DevAzure JSON Patch operations
- Dry-run mode for safe setup and validation
- Node built-in test coverage for signature validation and mapping behavior
- A scaffolded private Zendesk sidebar app package under `zendesk-sidebar-app/`

## Official references used

- Zendesk webhook authenticity: [developer.zendesk.com/documentation/event-connectors/webhooks/verifying](https://developer.zendesk.com/documentation/event-connectors/webhooks/verifying)
- Zendesk webhook request anatomy: [developer.zendesk.com/documentation/webhooks/anatomy-of-a-webhook-request](https://developer.zendesk.com/documentation/webhooks/anatomy-of-a-webhook-request/)
- Zendesk ticket events: [developer.zendesk.com/api-reference/webhooks/event-types/ticket-events](https://developer.zendesk.com/api-reference/webhooks/event-types/ticket-events/)
- Azure DevOps work item create: [learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/create?view=azure-devops-rest-7.1)
- Azure DevOps work item update: [learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/update](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/work-items/update?view=azure-devops-rest-7.1)

## Quick start

```bash
cd ./devazure-zendesk-sync
cp .env.example .env
edit .env with your real credentials
npm run typecheck
npm run test
```

To build and start:

```bash
npm run build
npm start
```

`npm start` automatically loads values from `.env` when that file exists.

Default webhook URL:

```text
POST http://localhost:8787/webhooks/zendesk
```

Health check:

```text
GET http://localhost:8787/health
```

## Standalone delivery

This package is designed to be delivered independently from any internal monorepo or platform branding.

- It has no runtime dependency on any internal platform components.
- The service uses only Node built-ins at runtime.
- The delivery bundle can be generated with `npm run package:standalone`.
- The generated bundle lands in `release/devazure-zendesk-sync/`.

See [CLIENT-HANDOFF.md](./CLIENT-HANDOFF.md) for the delivery checklist.

## Project docs

The fuller spec and design set now lives inside this standalone project:

- [docs/README.md](./docs/README.md)
- [docs/proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./docs/proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
- [docs/proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./docs/proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
- [docs/proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md](./docs/proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md)
- [docs/reports/2026-04-17-zendesk-sidebar-app-sota-and-knowledge-gap-analysis.md](./docs/reports/2026-04-17-zendesk-sidebar-app-sota-and-knowledge-gap-analysis.md)

## Environment

Required:

- `ZENDESK_WEBHOOK_SECRET`
- `DEVAZURE_ORG_URL`
- `DEVAZURE_PROJECT`
- `DEVAZURE_PAT`

Recommended during initial setup:

- `SYNC_DRY_RUN=true`

Optional:

- `ZENDESK_BASE_URL`
- `DEVAZURE_AREA_PATH`
- `DEVAZURE_ITERATION_PATH`
- `DEVAZURE_ASSIGNED_TO`
- `INBOUND_BEARER_TOKEN`

## Sync behavior

The starter currently does the following:

1. Accepts a Zendesk webhook event.
2. Verifies the signature unless verification is explicitly disabled.
3. Parses ticket metadata from the event payload.
4. Ignores destructive ticket events such as soft-delete and spam-marking.
5. Looks for an existing DevAzure work item tagged with `zendesk:id:<ticket-id>`.
6. Creates or updates a DevAzure work item using JSON Patch operations.

Default field mapping:

- Zendesk `subject` -> `System.Title`
- Zendesk description and metadata -> `System.Description`
- Zendesk priority -> `Microsoft.VSTS.Common.Priority`
- Zendesk status and tags -> `System.Tags`
- Zendesk ticket URL -> `Hyperlink` relation when `ZENDESK_BASE_URL` is set

## Suggested next steps

- Install and validate the scaffolded sidebar app on `Musa ADO Form Testing`
- Add app-facing backend endpoints for summary, create, and link-existing
- Add reverse sync for Azure DevOps state changes back to Zendesk
- Replace the temporary quick tunnel with stable public ingress
- Add deployment packaging for the final client HTTPS target
