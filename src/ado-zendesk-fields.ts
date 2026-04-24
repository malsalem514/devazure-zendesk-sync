import type { ZendeskFieldMapping } from './lib/zendesk-api.js';

/**
 * Zendesk stores only the support-facing ADO projection we intentionally expose
 * on the ticket: link identity, current support status, sprint/ETA context, and
 * sync health. It must not grow into a full shadow copy of the work item.
 */
export function buildClearedAdoZendeskFields(): ZendeskFieldMapping {
  return {
    devFunnelNumber: null,
    adoWorkItemId: null,
    adoWorkItemUrl: null,
    adoStatus: null,
    adoStatusDetail: null,
    adoSprint: null,
    adoSprintStart: null,
    adoSprintEnd: null,
    adoEta: null,
    adoSyncHealth: null,
    adoLastSyncAt: null,
  };
}

export interface LinkedAdoZendeskFieldProjection {
  workItemUrl?: string | null;
  statusTag?: string | null;
  statusDetail?: string | null;
  sprint?: string | null;
  sprintStart?: string | null;
  sprintEnd?: string | null;
  eta?: string | null;
  syncHealth?: string | null;
  lastSyncAt?: string | null;
}

export function buildLinkedAdoZendeskFields(
  workItemId: number,
  projection: LinkedAdoZendeskFieldProjection = {},
): ZendeskFieldMapping {
  return {
    ...buildClearedAdoZendeskFields(),
    adoWorkItemId: workItemId,
    adoWorkItemUrl: projection.workItemUrl ?? null,
    adoStatus: projection.statusTag ?? null,
    adoStatusDetail: projection.statusDetail ?? null,
    adoSprint: projection.sprint ?? null,
    adoSprintStart: projection.sprintStart ?? null,
    adoSprintEnd: projection.sprintEnd ?? null,
    adoEta: projection.eta ?? null,
    adoSyncHealth: projection.syncHealth ?? null,
    adoLastSyncAt: projection.lastSyncAt ?? null,
  };
}
