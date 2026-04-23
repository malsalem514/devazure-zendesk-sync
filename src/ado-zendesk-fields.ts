import type { ZendeskFieldMapping } from './lib/zendesk-api.js';

/**
 * Zendesk should store the relationship, not a shadow copy of ADO.
 * Keep these helpers explicit so every create/link/unlink path clears legacy
 * mirror fields and leaves only the minimal ADO linkage field when linked.
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

export function buildLinkedAdoZendeskFields(workItemId: number): ZendeskFieldMapping {
  return {
    ...buildClearedAdoZendeskFields(),
    adoWorkItemId: workItemId,
  };
}
