import {
  ADO_STATUS_TAGS,
  ADO_SYNC_HEALTH_TAGS,
  computeAdoFingerprint,
  deriveAdoStatus,
  fetchIterationMetadata,
  formatStatusDetail,
  hasDatedRange,
} from './ado-status.js';
import { DevAzureClient, DevAzureHttpError } from './devazure-client.js';
import { execute, query } from './lib/oracle.js';
import { getTicket, getTicketRaw, updateTicketWithNote, type ZendeskTicketSnapshot } from './lib/zendesk-api.js';
import { buildSyncPlan } from './sync-planner.js';
import { ZENDESK_FIELD_IDS, ZENDESK_ROUTING_FIELD_IDS } from './zendesk-field-ids.js';
import type { AppConfig, ZendeskTicketDetail, ZendeskTicketEvent } from './types.js';

export interface SyncLinkRow {
  ADO_ORG: string;
  ADO_PROJECT: string;
  ADO_WORK_ITEM_ID: number;
  LAST_SYNCED_AT: Date | null;
  LAST_SYNC_SOURCE: string | null;
}

export interface SummaryResponse {
  ok: true;
  ticketId: number;
  linked: boolean;
  workItem?: {
    id: number;
    url: string;
    status: string | null;
    statusDetail: string | null;
    sprint: string | null;
    eta: string | null;
    syncHealth: string | null;
    lastSyncAt: string | null;
  };
}

export class AppActionError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
  }
}

function coerceString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function coerceIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  return s === '' ? null : s;
}

function buildWorkItemUrl(orgUrl: string, project: string, workItemId: number | string): string {
  const base = orgUrl.replace(/\/$/, '');
  const encodedProject = encodeURIComponent(project);
  return `${base}/${encodedProject}/_workitems/edit/${workItemId}`;
}

export function buildSummaryFromSnapshot(
  ticketId: number,
  link: SyncLinkRow | null,
  snapshot: ZendeskTicketSnapshot | null,
  orgUrl: string,
): SummaryResponse {
  if (!link) {
    return { ok: true, ticketId, linked: false };
  }

  const fields = snapshot?.customFields ?? {};
  const byTag = (tag: string): unknown => fields[ZENDESK_FIELD_IDS[tag]];

  const urlFromZd = coerceString(byTag('ado_work_item_url'));
  const url = urlFromZd ?? buildWorkItemUrl(orgUrl, link.ADO_PROJECT, link.ADO_WORK_ITEM_ID);

  return {
    ok: true,
    ticketId,
    linked: true,
    workItem: {
      id: link.ADO_WORK_ITEM_ID,
      url,
      status: coerceString(byTag('ado_status_detail')) ?? coerceString(byTag('ado_status')),
      statusDetail: coerceString(byTag('ado_status_detail')),
      sprint: coerceString(byTag('ado_sprint')),
      eta: coerceIso(byTag('ado_eta')),
      syncHealth: coerceString(byTag('ado_sync_health')),
      lastSyncAt: coerceIso(byTag('ado_last_sync_at')) ?? coerceIso(link.LAST_SYNCED_AT),
    },
  };
}

function validateTicketId(ticketIdRaw: string): number {
  if (!/^\d+$/.test(ticketIdRaw)) {
    throw new AppActionError(`Invalid ticketId: ${ticketIdRaw}`, 400);
  }
  return Number(ticketIdRaw);
}

async function loadActiveLink(ticketIdRaw: string): Promise<SyncLinkRow | null> {
  const rows = await query<SyncLinkRow>(
    `SELECT ADO_ORG, ADO_PROJECT, ADO_WORK_ITEM_ID, LAST_SYNCED_AT, LAST_SYNC_SOURCE
     FROM SYNC_LINK
     WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { ticketId: ticketIdRaw },
  );
  return rows[0] ?? null;
}

export async function getTicketSummary(
  config: AppConfig,
  ticketIdRaw: string,
): Promise<SummaryResponse> {
  const ticketId = validateTicketId(ticketIdRaw);
  const link = await loadActiveLink(ticketIdRaw);
  const snapshot = link ? await getTicket(config, ticketId) : null;
  return buildSummaryFromSnapshot(ticketId, link, snapshot, config.devAzure.orgUrl);
}

// ------------------------------------------------------------------------
// Ticket API response -> ZendeskTicketEvent
// ------------------------------------------------------------------------

/**
 * Map a Zendesk API `tickets.show` response to the same ZendeskTicketEvent
 * shape the webhook parser produces. This lets the sidebar-click create path
 * reuse `buildSyncPlan` unchanged.
 *
 * Routing-input custom fields (`product`, `case_type`, `crf`) are read from
 * `custom_fields` by ID. `org_name` is not a custom field in the pilot tenant;
 * leaving null means the planner will not set `/fields/Custom.Client` which is
 * fine — the webhook path uses a liquid `{{ticket.organization.name}}` pull.
 */
export function ticketToEvent(
  ticket: Record<string, unknown>,
  source: 'sidebar_create' | 'sidebar_link',
): ZendeskTicketEvent {
  const ticketId = String(ticket.id ?? '');
  if (!/^\d+$/.test(ticketId)) {
    throw new AppActionError(`Unexpected ticket shape from Zendesk: missing numeric id`, 500);
  }
  const customByFieldId: Record<number, unknown> = {};
  for (const f of (ticket.custom_fields ?? []) as Array<{ id: number; value: unknown }>) {
    customByFieldId[f.id] = f.value;
  }

  const detail: ZendeskTicketDetail = {
    id: ticketId,
    subject: coerceString(ticket.subject),
    description: coerceString(ticket.description),
    status: coerceString(ticket.status),
    priority: coerceString(ticket.priority),
    type: coerceString(ticket.type),
    tags: Array.isArray(ticket.tags) ? (ticket.tags as string[]).map(String) : [],
    updatedAt: coerceString(ticket.updated_at),
    createdAt: coerceString(ticket.created_at),
    requesterId: coerceString(ticket.requester_id),
    assigneeId: coerceString(ticket.assignee_id),
    organizationId: coerceString(ticket.organization_id),
    groupId: coerceString(ticket.group_id),
    brandId: coerceString(ticket.brand_id),
    viaChannel: typeof ticket.via === 'object' && ticket.via !== null
      ? coerceString((ticket.via as Record<string, unknown>).channel)
      : null,
    product: coerceString(customByFieldId[ZENDESK_ROUTING_FIELD_IDS.product]),
    orgName: null,
    caseType: coerceString(customByFieldId[ZENDESK_ROUTING_FIELD_IDS.case_type]),
    crf: coerceString(customByFieldId[ZENDESK_ROUTING_FIELD_IDS.crf]),
  };

  return {
    id: `${source}:${ticketId}:${Date.now()}`,
    type: source === 'sidebar_create' ? 'zen:event-type:ticket.created' : 'zen:event-type:ticket.linked',
    subject: detail.subject,
    time: new Date().toISOString(),
    zendeskEventVersion: null,
    detail,
    commentId: null,
    commentBody: null,
  };
}

// ------------------------------------------------------------------------
// POST /app/ado/tickets/:id/create
// ------------------------------------------------------------------------

async function freshSummary(
  config: AppConfig,
  ticketIdRaw: string,
): Promise<SummaryResponse> {
  const link = await loadActiveLink(ticketIdRaw);
  const snapshot = await getTicket(config, Number(ticketIdRaw));
  return buildSummaryFromSnapshot(Number(ticketIdRaw), link, snapshot, config.devAzure.orgUrl);
}

export interface CreateResult {
  action: 'created' | 'already_linked';
  summary: SummaryResponse;
}

export async function createAdoFromTicket(
  config: AppConfig,
  ticketIdRaw: string,
  ado: DevAzureClient,
): Promise<CreateResult> {
  const ticketId = validateTicketId(ticketIdRaw);

  const existingLink = await loadActiveLink(ticketIdRaw);
  if (existingLink) {
    return { action: 'already_linked', summary: await freshSummary(config, ticketIdRaw) };
  }

  const fullTicket = await getTicketRaw(config, ticketId);
  if (!fullTicket) {
    throw new AppActionError(`Zendesk ticket #${ticketId} not found`, 404);
  }
  const event = ticketToEvent(fullTicket, 'sidebar_create');

  const existingWorkItem = await ado.findWorkItemByZendeskTicketId(event.detail.id);
  const plan = buildSyncPlan(event, config, existingWorkItem);
  if (plan.action === 'noop') {
    throw new AppActionError(`Cannot create: ${plan.reason}`, 400);
  }

  const result = plan.action === 'create'
    ? await ado.createWorkItem(plan.workItemType, plan.operations)
    : await ado.updateWorkItem(existingWorkItem!.id, plan.operations);

  await execute(
    `INSERT INTO SYNC_LINK (ZENDESK_TICKET_ID, ADO_ORG, ADO_PROJECT, ADO_WORK_ITEM_ID, LINK_MODE, LAST_SYNC_SOURCE, LAST_SYNCED_AT)
     VALUES (:ticketId, :org, :project, :workItemId, :mode, 'zendesk', SYSTIMESTAMP)`,
    {
      ticketId: event.detail.id,
      org: config.devAzure.orgUrl,
      project: config.devAzure.project,
      workItemId: Number(result.id),
      mode: plan.action === 'create' ? 'created' : 'linked',
    },
  );

  const workItemUrl = buildWorkItemUrl(config.devAzure.orgUrl, config.devAzure.project, result.id);
  await updateTicketWithNote(
    config,
    event.detail.id,
    {
      devFunnelNumber: workItemUrl,
      adoWorkItemId: Number(result.id),
      adoWorkItemUrl: workItemUrl,
      adoStatus: ADO_STATUS_TAGS.inDevBacklog,
      adoStatusDetail: 'In backlog',
      adoSyncHealth: ADO_SYNC_HEALTH_TAGS.ok,
      adoLastSyncAt: new Date().toISOString(),
    },
    `[Synced by sidebar] Linked to Azure DevOps ${plan.workItemType} #${result.id}\n${workItemUrl}`,
  );

  await execute(
    `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
     VALUES (:action, 'agent', 'zendesk', 'ado', :ticketId, :workItemId, :summary)`,
    {
      action: 'sidebar_create',
      ticketId: event.detail.id,
      workItemId: result.id,
      summary: `Agent-initiated create: ${plan.workItemType} #${result.id} from ticket #${event.detail.id}`,
    },
  );

  return { action: 'created', summary: await freshSummary(config, ticketIdRaw) };
}

// ------------------------------------------------------------------------
// POST /app/ado/tickets/:id/link
// ------------------------------------------------------------------------

/**
 * Accept numeric work item ID ("79741") or an ADO work item URL
 * ("https://dev.azure.com/<org>/<project>/_workitems/edit/79741").
 */
export function parseWorkItemReference(reference: string): number {
  const trimmed = reference.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const urlMatch = trimmed.match(/\/_workitems\/edit\/(\d+)(?:[/?#].*)?$/);
  if (urlMatch) {
    return Number(urlMatch[1]);
  }
  throw new AppActionError(
    `Cannot parse ADO work item reference: ${reference}. Expected numeric ID or ADO URL.`,
    400,
  );
}

export interface LinkResult {
  action: 'linked' | 'already_linked';
  summary: SummaryResponse;
}

export async function linkExistingAdoWorkItem(
  config: AppConfig,
  ticketIdRaw: string,
  reference: string,
  ado: DevAzureClient,
): Promise<LinkResult> {
  const ticketId = validateTicketId(ticketIdRaw);
  const workItemId = parseWorkItemReference(reference);

  const existingLink = await loadActiveLink(ticketIdRaw);
  if (existingLink) {
    return { action: 'already_linked', summary: await freshSummary(config, ticketIdRaw) };
  }

  let snapshot;
  try {
    snapshot = await ado.getWorkItem(workItemId);
  } catch (err) {
    if (err instanceof DevAzureHttpError) {
      throw new AppActionError(`ADO work item #${workItemId} lookup failed: ${err.message}`, err.status);
    }
    throw err;
  }
  if (!snapshot) {
    throw new AppActionError(`ADO work item #${workItemId} not found`, 404);
  }

  // Tag the ADO work item with zendesk:id:<ticketId> so the existing WIQL-based
  // dedupe path picks it up as "already linked" on any future Zendesk event.
  const zendeskTag = `zendesk:id:${ticketId}`;
  if (!snapshot.tags.includes(zendeskTag)) {
    const mergedTags = [...snapshot.tags, zendeskTag].join('; ');
    await ado.updateWorkItem(String(workItemId), [
      { op: 'test', path: '/rev', value: snapshot.rev },
      { op: 'add', path: '/fields/System.Tags', value: mergedTags },
    ]);
  }

  await execute(
    `INSERT INTO SYNC_LINK (ZENDESK_TICKET_ID, ADO_ORG, ADO_PROJECT, ADO_WORK_ITEM_ID, LINK_MODE, LAST_SYNC_SOURCE, LAST_SYNCED_AT)
     VALUES (:ticketId, :org, :project, :workItemId, 'linked', 'ado', SYSTIMESTAMP)`,
    {
      ticketId: String(ticketId),
      org: config.devAzure.orgUrl,
      project: config.devAzure.project,
      workItemId,
    },
  );

  // Pull current ADO state onto the Zendesk ticket immediately so the sidebar
  // shows live status without waiting for the 15-min reconciler.
  const iteration = await fetchIterationMetadata(ado, config.devAzure.project, snapshot.iterationPath);
  const dated = hasDatedRange(iteration);
  const status = deriveAdoStatus({ workItemState: snapshot.state, hasDatedSprint: dated });
  const sprintName = dated ? iteration!.displayName : null;
  const sprintStart = dated ? iteration!.startDate : null;
  const sprintEnd = dated ? iteration!.finishDate : null;
  const statusDetail = formatStatusDetail({
    status,
    workItemState: snapshot.state,
    sprintName,
    sprintStart,
    sprintEnd,
  });
  const workItemUrl = buildWorkItemUrl(config.devAzure.orgUrl, config.devAzure.project, workItemId);
  const fingerprint = computeAdoFingerprint({
    workItemState: snapshot.state,
    status,
    statusDetail,
    sprintName,
    sprintStart,
    sprintEnd,
    eta: sprintEnd,
    workItemUrl,
  });

  await updateTicketWithNote(
    config,
    String(ticketId),
    {
      devFunnelNumber: workItemUrl,
      adoWorkItemId: workItemId,
      adoWorkItemUrl: workItemUrl,
      adoStatus: status,
      adoStatusDetail: statusDetail,
      adoSprint: sprintName,
      adoSprintStart: sprintStart ? sprintStart.slice(0, 10) : null,
      adoSprintEnd: sprintEnd ? sprintEnd.slice(0, 10) : null,
      adoEta: sprintEnd ? sprintEnd.slice(0, 10) : null,
      adoSyncHealth: ADO_SYNC_HEALTH_TAGS.ok,
      adoLastSyncAt: new Date().toISOString(),
    },
    `[Synced by sidebar] Linked to existing Azure DevOps work item #${workItemId}\n${workItemUrl}`,
  );

  await execute(
    `UPDATE SYNC_LINK
        SET LAST_ADO_FINGERPRINT = :fp
      WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { fp: fingerprint, ticketId: String(ticketId) },
  );

  await execute(
    `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
     VALUES ('sidebar_link', 'agent', 'ado', 'zendesk', :ticketId, :workItemId, :summary)`,
    {
      ticketId: String(ticketId),
      workItemId: String(workItemId),
      summary: `Agent-initiated link: ticket #${ticketId} → ADO #${workItemId}`,
    },
  );

  return { action: 'linked', summary: await freshSummary(config, ticketIdRaw) };
}
