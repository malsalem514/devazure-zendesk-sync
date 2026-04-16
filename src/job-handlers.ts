import {
  ADO_STATUS_TAGS,
  ADO_SYNC_HEALTH_TAGS,
  computeAdoFingerprint,
  deriveAdoStatus,
  fetchIterationMetadata,
  formatStatusDetail,
  type AdoStatusTag,
} from './ado-status.js';
import { DevAzureClient } from './devazure-client.js';
import { execute, query } from './lib/oracle.js';
import { updateTicketWithNote, setFieldIdMap } from './lib/zendesk-api.js';
import { buildSyncPlan } from './sync-planner.js';
import { parseZendeskTicketEvent } from './zendesk-event-parser.js';
import { ZENDESK_FIELD_IDS } from './zendesk-field-ids.js';
import type { AppConfig } from './types.js';
import type { JobHandler } from './worker.js';

setFieldIdMap(ZENDESK_FIELD_IDS);

let cachedAdoClient: DevAzureClient | null = null;

function getAdoClient(config: AppConfig): DevAzureClient {
  if (!cachedAdoClient) {
    cachedAdoClient = new DevAzureClient(config.devAzure);
  }
  return cachedAdoClient;
}

async function handleSyncZendeskToAdo(
  _jobType: string,
  payload: unknown,
  config: AppConfig,
): Promise<void> {
  const { rawBody, ticketId } = payload as { rawBody: string; ticketId: string };

  const event = parseZendeskTicketEvent(rawBody);
  const devAzureClient = getAdoClient(config);

  const existingWorkItem = await devAzureClient.findWorkItemByZendeskTicketId(event.detail.id);
  const plan = buildSyncPlan(event, config, existingWorkItem);

  if (plan.action === 'noop') {
    console.log(`[job] noop for ticket=${ticketId}: ${plan.reason}`);
    return;
  }

  const result = plan.action === 'create'
    ? await devAzureClient.createWorkItem(plan.workItemType, plan.operations)
    : await devAzureClient.updateWorkItem(existingWorkItem!.id, plan.operations);

  console.log(`[job] ${plan.action} ticket=${ticketId} workItem=${result.id}`);

  if (plan.action === 'create') {
    await execute(
      `INSERT INTO SYNC_LINK (ZENDESK_TICKET_ID, ADO_ORG, ADO_PROJECT, ADO_WORK_ITEM_ID, LINK_MODE, LAST_SYNC_SOURCE, LAST_SYNCED_AT)
       VALUES (:ticketId, :org, :project, :workItemId, 'created', 'zendesk', SYSTIMESTAMP)`,
      {
        ticketId: event.detail.id,
        org: config.devAzure.orgUrl,
        project: config.devAzure.project,
        workItemId: Number(result.id),
      },
    );
  }

  // Single Zendesk API call: update fields + add private note
  const workItemUrl = `${config.devAzure.orgUrl.replace(/\/$/, '')}/${config.devAzure.project}/_workitems/edit/${result.id}`;

  await updateTicketWithNote(
    config,
    ticketId,
    {
      adoWorkItemId: Number(result.id),
      adoWorkItemUrl: workItemUrl,
      adoStatus: 'ado_status_in_dev_backlog',
      adoStatusDetail: 'In backlog',
      adoSyncHealth: 'ado_sync_health_ok',
      adoLastSyncAt: new Date().toISOString(),
    },
    `[Synced by integration] Linked to Azure DevOps ${plan.workItemType} #${result.id}\n${workItemUrl}`,
  );

  await execute(
    `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
     VALUES (:action, 'integration', 'zendesk', 'ado', :ticketId, :workItemId, :summary)`,
    {
      action: plan.action === 'create' ? 'create_work_item' : 'update_work_item',
      ticketId: event.detail.id,
      workItemId: result.id,
      summary: `${plan.action} ${plan.workItemType} #${result.id} from Zendesk ticket #${event.detail.id}`,
    },
  );
}

/**
 * Reverse-sync handler: pull fresh state from ADO and reflect it on the linked
 * Zendesk ticket. Relies on a SHA-256 fingerprint stored on SYNC_LINK to skip
 * redundant Zendesk writes (design pillar 2 — cut feedback-loop traffic).
 */
async function handleSyncAdoStateToZendesk(
  _jobType: string,
  payload: unknown,
  config: AppConfig,
): Promise<void> {
  const { workItemId } = (payload ?? {}) as { workItemId?: number };
  if (typeof workItemId !== 'number' || !Number.isFinite(workItemId)) {
    throw new Error(`Invalid workItemId in payload: ${JSON.stringify(payload)}`);
  }

  const linkRows = await query<{
    ID: number;
    ZENDESK_TICKET_ID: string;
    ADO_PROJECT: string;
    LAST_ADO_FINGERPRINT: string | null;
  }>(
    `SELECT ID, ZENDESK_TICKET_ID, ADO_PROJECT, LAST_ADO_FINGERPRINT
       FROM SYNC_LINK
      WHERE ADO_WORK_ITEM_ID = :workItemId AND IS_ACTIVE = 1`,
    { workItemId },
  );

  const link = linkRows[0];
  if (!link) {
    console.log(`[job] sync_ado_state_to_zendesk: no active link for workItem=${workItemId} — skipping`);
    return;
  }

  const client = getAdoClient(config);
  const snapshot = await client.getWorkItem(workItemId);
  if (!snapshot) {
    console.log(`[job] sync_ado_state_to_zendesk: workItem=${workItemId} not found (deleted?)`);
    return;
  }

  const iteration = await fetchIterationMetadata(client, link.ADO_PROJECT, snapshot.iterationPath);
  const status = deriveAdoStatus({
    workItemState: snapshot.state,
    hasDatedSprint: Boolean(iteration?.hasDatedRange),
  });

  const sprintName = iteration?.hasDatedRange ? iteration.displayName : null;
  const sprintStart = iteration?.hasDatedRange ? iteration.startDate : null;
  const sprintEnd = iteration?.hasDatedRange ? iteration.finishDate : null;
  const statusDetail = formatStatusDetail({
    status,
    workItemState: snapshot.state,
    sprintName,
    sprintStart,
    sprintEnd,
  });
  // v1 rule: ETA mirrors sprint end when a dated sprint is assigned; otherwise blank.
  const eta = sprintEnd;
  const workItemUrl = buildWorkItemUrl(config, snapshot.id);

  const fingerprint = computeAdoFingerprint({
    workItemState: snapshot.state,
    status,
    statusDetail,
    sprintName,
    sprintStart,
    sprintEnd,
    eta,
    workItemUrl,
  });

  if (fingerprint === link.LAST_ADO_FINGERPRINT) {
    console.log(
      `[job] sync_ado_state_to_zendesk: fingerprint unchanged workItem=${workItemId} ticket=${link.ZENDESK_TICKET_ID} — noop`,
    );
    return;
  }

  const previousStatus = await lookupPreviousStatus(link.LAST_ADO_FINGERPRINT);
  const privateNote = buildPrivateNote(status, statusDetail, previousStatus, workItemUrl);

  await updateTicketWithNote(
    config,
    link.ZENDESK_TICKET_ID,
    {
      adoStatus: status,
      adoStatusDetail: statusDetail,
      adoSprint: sprintName,
      adoSprintStart: toZendeskDate(sprintStart),
      adoSprintEnd: toZendeskDate(sprintEnd),
      adoEta: toZendeskDate(eta),
      adoSyncHealth: ADO_SYNC_HEALTH_TAGS.ok,
      adoLastSyncAt: new Date().toISOString(),
    },
    privateNote,
  );

  await execute(
    `UPDATE SYNC_LINK
        SET LAST_ADO_FINGERPRINT = :fp,
            LAST_SYNC_SOURCE = 'ado',
            LAST_SYNCED_AT = SYSTIMESTAMP,
            UPDATED_AT = SYSTIMESTAMP
      WHERE ID = :id`,
    { fp: fingerprint, id: link.ID },
  );

  await execute(
    `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
     VALUES ('sync_ado_to_zendesk', 'integration', 'ado', 'zendesk', :ticketId, :workItemId, :summary)`,
    {
      ticketId: link.ZENDESK_TICKET_ID,
      workItemId: String(workItemId),
      summary: `ADO #${workItemId} → ticket #${link.ZENDESK_TICKET_ID}: ${status} (${statusDetail})`,
    },
  );

  console.log(
    `[job] sync_ado_state_to_zendesk: workItem=${workItemId} ticket=${link.ZENDESK_TICKET_ID} status=${status}`,
  );
}

function buildWorkItemUrl(config: AppConfig, workItemId: string | number): string {
  return `${config.devAzure.orgUrl.replace(/\/$/, '')}/${config.devAzure.project}/_workitems/edit/${workItemId}`;
}

function toZendeskDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Best-effort lookup of the prior status tag so we only post a private note
 * when `ADO Status` meaningfully changes. If we can't recover it (first sync,
 * pre-migration link), we still post — agents expect a change trail.
 */
async function lookupPreviousStatus(_previousFingerprint: string | null): Promise<AdoStatusTag | null> {
  // Intentionally simple — we don't persist previous status separately in v1.
  // Callers treat `null` as "post note regardless". Extracted for clarity and
  // to make the "only note on transition" upgrade path a one-file change.
  return null;
}

function buildPrivateNote(
  status: AdoStatusTag,
  statusDetail: string,
  previousStatus: AdoStatusTag | null,
  workItemUrl: string,
): string | undefined {
  const marker = '[Synced by integration]';
  if (previousStatus && previousStatus === status) return undefined;
  const labelLookup: Record<AdoStatusTag, string> = {
    [ADO_STATUS_TAGS.inDevBacklog]: 'In Dev Backlog',
    [ADO_STATUS_TAGS.scheduledInSprint]: 'Scheduled In Sprint',
    [ADO_STATUS_TAGS.devInProgress]: 'Dev In Progress',
    [ADO_STATUS_TAGS.supportReady]: 'Support Ready',
  };
  return `${marker} ADO status → ${labelLookup[status]}: ${statusDetail}\n${workItemUrl}`;
}

export const jobHandlers: Record<string, JobHandler> = {
  create_ado_from_zendesk: handleSyncZendeskToAdo,
  update_ado_from_zendesk: handleSyncZendeskToAdo,
  sync_ado_state_to_zendesk: handleSyncAdoStateToZendesk,
};

export function dispatchJob(jobType: string, payload: unknown, config: AppConfig): Promise<void> {
  const handler = jobHandlers[jobType];
  if (!handler) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  return handler(jobType, payload, config);
}
