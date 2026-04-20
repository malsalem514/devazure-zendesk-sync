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

## Canonical Design Docs

- [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
  Requirements, confirmed tenant findings, constraints, open implementation decisions, and recommended next build steps.
- [ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
  Target architecture, runtime components, Oracle persistence model, and deployment direction.
- [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
  Zendesk-facing field contract for v1.
- [ZENDESK-ADO-V1-ROUTING-MATRIX.md](./proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md)
  V1 product-family routing defaults for new Azure DevOps work item creation.

## Proposals

- [ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](./proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md)
- [ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](./proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md)
- [ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md](./proposals/ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md)
- [ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](./proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md)
- [ZENDESK-ADO-V1-ROUTING-MATRIX.md](./proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md)
- [DEVAZURE-ZENDESK-INTEGRATION-PROJECT-CHARTER.md](./proposals/DEVAZURE-ZENDESK-INTEGRATION-PROJECT-CHARTER.md)

## Reports

- [2026-04-15-zendesk-ado-sota-research-gap-analysis.md](./reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md)
- [2026-04-16-sota-inventory-and-leverage-plan.md](./reports/2026-04-16-sota-inventory-and-leverage-plan.md) — Package decisions, reference architectures, and build-vs-buy analysis for v1

## Current Code Vs Target Design

- **Phases 1-5 of the target v1 design are implemented in-repo.** The service has Oracle-backed persistence (6 tables), a durable `SELECT FOR UPDATE SKIP LOCKED` worker, the V1 routing matrix, bidirectional sync (Zendesk → ADO create/update + ADO → Zendesk status/sprint/ETA via service hook), a reconciler safety net, and a Docker deployment package.
- **The stack is deployed** on `ubuntu-docker-host` in `SYNC_DRY_RUN=false` mode. Container healthy, Oracle pool + schema initialized, worker + reconciler crons running.
- **The only gap to real end-to-end traffic** is the public URL (DNS + 443 port-forward — tracked in `conductor/tracks.md` as `OPS-002`).
- **Phase 6 (comment/attachment sync, link-existing workflow)** is planned next.
- Use the canonical design docs above when implementation choices conflict with the starter README or historical charter.

## What Is Not In Docs

- Real secrets and live credentials should stay only in the local `.env` file.
- The final go-live Azure DevOps project is still treated as an open implementation decision unless a later doc explicitly locks it.

## Historical Note

I left older MusaOS-internal DevAzure adapter planning docs in the `MusaOS` repo, because those describe daemon-integrated QA work rather than this standalone client integration.
