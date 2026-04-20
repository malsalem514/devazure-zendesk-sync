import { DevAzureClient } from './devazure-client.js';
import { execute } from './lib/oracle.js';
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
      devFunnelNumber: workItemUrl,
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

export const jobHandlers: Record<string, JobHandler> = {
  create_ado_from_zendesk: handleSyncZendeskToAdo,
  update_ado_from_zendesk: handleSyncZendeskToAdo,
};

export function dispatchJob(jobType: string, payload: unknown, config: AppConfig): Promise<void> {
  const handler = jobHandlers[jobType];
  if (!handler) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  return handler(jobType, payload, config);
}
