# DevAzure Zendesk Sync Docs

Project-specific specs, designs, and research for the standalone Zendesk to Azure DevOps integration live here.

## Start Here

For the next coding session, read in this order:

1. [../conductor/product.md](../conductor/product.md)
2. [../conductor/tech-stack.md](../conductor/tech-stack.md)
3. [../conductor/workflow.md](../conductor/workflow.md)
4. [../conductor/tracks.md](../conductor/tracks.md)
5. [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
6. [ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
7. [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
8. [ZENDESK-ADO-V1-ROUTING-MATRIX.md](./proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md)
9. [ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md](./proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md)

## Canonical Design Docs

- [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
  Requirements, confirmed tenant findings, constraints, open implementation decisions, and recommended next build steps.
- [ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
  Target architecture, runtime components, Oracle persistence model, and deployment direction.
- [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
  Zendesk-facing field contract for v1.
- [ZENDESK-ADO-V1-ROUTING-MATRIX.md](./proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md)
  V1 product-family routing defaults for new Azure DevOps work item creation.
- [ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md](./proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md)
  Concrete package, UI, API-contract, and rollout spec for the private Zendesk sidebar app.

## Proposals

- [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
- [ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
- [ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md](./proposals/ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md)
- [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- [ZENDESK-ADO-V1-ROUTING-MATRIX.md](./proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md)
- [ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md](./proposals/ZENDESK-SIDEBAR-APP-IMPLEMENTATION-SPEC.md)
- [DEVAZURE-ZENDESK-INTEGRATION-PROJECT-CHARTER.md](./proposals/DEVAZURE-ZENDESK-INTEGRATION-PROJECT-CHARTER.md)

## Reports

- [2026-04-15-zendesk-ado-sota-research-gap-analysis.md](./reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md)
- [2026-04-16-sota-inventory-and-leverage-plan.md](./reports/2026-04-16-sota-inventory-and-leverage-plan.md) — Package decisions, reference architectures, and build-vs-buy analysis for v1
- [2026-04-17-zendesk-ado-implementation-checklist.md](./reports/2026-04-17-zendesk-ado-implementation-checklist.md) — Practical build checklist for what is live now, what reverse sync still needs, and what native Zendesk create/link UX still needs
- [2026-04-17-zendesk-sidebar-app-sota-and-knowledge-gap-analysis.md](./reports/2026-04-17-zendesk-sidebar-app-sota-and-knowledge-gap-analysis.md) — Sidebar-app-first research on battle-tested Zendesk/Azure DevOps patterns, reusable code, and remaining research gaps

## Current Code Vs Target Design

- The current repository code is still a safe one-way starter: Zendesk webhook intake, signature verification, ticket parsing, and Azure DevOps create or update flow.
- The repo now also contains a scaffolded private Zendesk sidebar app package under `zendesk-sidebar-app/`; it builds, reads the pilot form and linked Zendesk fields, and self-hides outside the pilot form, but its actions are not wired yet.
- The target v1 design is broader: Oracle-backed persistence, worker tables, richer routing, bidirectional status sync, sprint visibility, and deployment on the client's Linux Docker host.
- Use the canonical design docs above when implementation choices conflict with the starter README or historical charter.

## Historical Docs

- [ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md](./proposals/ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md) is still useful for early discovery context, but its old sidebar-app timing and rollout assumptions are superseded by the canonical docs above.
- [2026-04-15-zendesk-ado-sota-research-gap-analysis.md](./reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md) remains useful as early research, but its recommendation that the sidebar app is optional and phase 2 is superseded by the newer sidebar-app-first docs.

## What Is Not In Docs

- Real secrets and live credentials should stay only in the local `.env` file.
- The final go-live Azure DevOps project is still treated as an open implementation decision unless a later doc explicitly locks it.

## Historical Note

I left older MusaOS-internal DevAzure adapter planning docs in the `MusaOS` repo, because those describe daemon-integrated QA work rather than this standalone client integration.
