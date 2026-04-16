# Workflow

## Session Startup Read Order

Start every implementation session with this sequence:

1. Read [product.md](./product.md).
2. Read [tech-stack.md](./tech-stack.md).
3. Read [tracks.md](./tracks.md).
4. Read [../docs/README.md](../docs/README.md).
5. Read the canonical design docs listed in that index before changing architecture or mappings.

## Document Precedence

When docs overlap, use this order of authority:

1. [product.md](./product.md), [tech-stack.md](./tech-stack.md), and [tracks.md](./tracks.md) for current agent context.
2. [../docs/proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md](../docs/proposals/ZENDESK-AZURE-DEVOPS-INTEGRATION-TECHNICAL-SPEC.md) for requirements, tenant findings, constraints, and implementation scope.
3. [../docs/proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md](../docs/proposals/ZENDESK-ADO-FULL-SOLUTION-DESIGN.md) for target architecture and Oracle persistence design.
4. [../docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md](../docs/proposals/ZENDESK-ADO-V1-FIELD-DEFINITIONS.md) and [../docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md](../docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md) for v1 mapping behavior.
5. [../docs/proposals/ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md](../docs/proposals/ZENDESK-ADO-INTEGRATION-SOLUTION-SUMMARY.md) for confirmation snapshots and open questions.
6. [../docs/reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md](../docs/reports/2026-04-15-zendesk-ado-sota-research-gap-analysis.md) for supporting research, not day-to-day implementation truth.
7. [../docs/proposals/DEVAZURE-ZENDESK-INTEGRATION-PROJECT-CHARTER.md](../docs/proposals/DEVAZURE-ZENDESK-INTEGRATION-PROJECT-CHARTER.md) as historical starter context only.

## Implementation Guardrails

- Keep the integration standalone; do not couple runtime logic to MusaOS or `MyReports`.
- Treat Oracle-backed worker tables as the default v1 execution model unless a new approved decision explicitly changes that.
- Keep secrets in local `.env` only; never move real credentials into docs, tests, or committed examples.
- Use the routing matrix and field-definition docs for v1 mapping behavior instead of inventing new defaults in code.
- Prefer durable async processing over inline webhook-side work whenever the target design calls for persistence or retries.

## Quality Gates

Before closing implementation work:

- run `npm run typecheck`
- run `npm test`
- update docs when a previously open decision becomes locked in code
- keep `docs/README.md` and `conductor/tracks.md` aligned with the current implementation state

## When Context Must Be Updated

Update the context docs when:

- a new dependency or runtime component is added
- a major design choice becomes final
- a workstream changes status
- the codebase meaningfully closes the gap between the starter and the target v1 architecture
