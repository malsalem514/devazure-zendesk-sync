import {
  ADO_SYNC_HEALTH_TAGS,
  computeAdoFingerprint,
  deriveAdoStatus,
  fetchIterationMetadata,
  formatStatusDetail,
  hasDatedRange,
} from './ado-status.js';
import { prepareRecentAdoComments } from './ado-comments.js';
import { buildClearedAdoZendeskFields, buildLinkedAdoZendeskFields } from './ado-zendesk-fields.js';
import {
  DevAzureClient,
  DevAzureHttpError,
  DevAzureTimeoutError,
  type AdoWorkItemComment,
  type AdoWorkItemSnapshot,
} from './devazure-client.js';
import { execute, query } from './lib/oracle.js';
import { formatSidebarActor, formatSidebarActorAuditSummary } from './lib/sidebar-actor.js';
import {
  getInitialTicketComment,
  getTicketRaw,
  updateTicketWithNote,
  type ZendeskTicketSnapshot,
} from './lib/zendesk-api.js';
import { buildSyncPlan } from './sync-planner.js';
import { ZENDESK_FIELD_IDS, ZENDESK_ROUTING_FIELD_IDS } from './zendesk-field-ids.js';
import type {
  AppConfig,
  SidebarActor,
  SupportHandoffFields,
  ZendeskTicketDetail,
  ZendeskTicketEvent,
} from './types.js';

export { cleanAdoCommentText, prepareRecentAdoComments } from './ado-comments.js';

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
    title: string | null;
    workItemType: string | null;
    state: string | null;
    reason: string | null;
    assignedTo: string | null;
    areaPath: string | null;
    iterationPath: string | null;
    priority: number | null;
    severity: string | null;
    product: string | null;
    client: string | null;
    crf: string | null;
    xref: string | null;
    bucket: string | null;
    unplanned: boolean | null;
    tags: string[];
    createdAt: string | null;
    changedAt: string | null;
    status: string | null;
    statusDetail: string | null;
    statusTag: string | null;
    sprint: string | null;
    eta: string | null;
    syncHealth: string | null;
    lastSyncAt: string | null;
    lastSyncSource: string | null;
    customerUpdate: string | null;
    recentComments: AdoWorkItemComment[];
  };
}

export interface AdoSupportProjection {
  status: string | null;
  statusDetail: string | null;
  statusTag: string | null;
  sprint: string | null;
  sprintStart: string | null;
  sprintEnd: string | null;
  eta: string | null;
  syncHealth: string | null;
}

interface AdoSummaryContext {
  adoSnapshot: AdoWorkItemSnapshot | null;
  adoProjection: AdoSupportProjection | null;
  recentComments: AdoWorkItemComment[];
}

interface LinkedFieldProjection {
  fields: ReturnType<typeof buildLinkedAdoZendeskFields>;
  fingerprint: string | null;
  workItemUrl: string;
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

function normalizeAdoDate(value: unknown): string | null {
  const iso = coerceIso(value);
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function latestIso(...values: Array<unknown>): string | null {
  const candidates = values
    .map(coerceIso)
    .filter((value): value is string => value != null)
    .map((value) => ({ value, time: new Date(value).getTime() }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => b.time - a.time);

  return candidates[0]?.value ?? null;
}

function buildWorkItemUrl(orgUrl: string, project: string, workItemId: number | string): string {
  const base = orgUrl.replace(/\/$/, '');
  const encodedProject = encodeURIComponent(project);
  return `${base}/${encodedProject}/_workitems/edit/${workItemId}`;
}

function sidebarActorLine(actor: SidebarActor | null | undefined): string {
  return `Performed by: ${formatSidebarActor(actor)}`;
}

function humanizeTag(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/^ado_status_/, '')
    .replace(/^ado_sync_health_/, '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function buildCustomerUpdate(workItem: {
  status: string | null;
  statusDetail: string | null;
  assignedTo: string | null;
  sprint: string | null;
  eta: string | null;
}): string | null {
  const pieces: string[] = [];
  const status = workItem.statusDetail ?? workItem.status;

  if (status) pieces.push(`Engineering status: ${status}.`);
  if (workItem.assignedTo) pieces.push(`Owner: ${workItem.assignedTo}.`);
  if (workItem.sprint) pieces.push(`Planned sprint: ${workItem.sprint}.`);
  if (workItem.eta) pieces.push(`Current ETA: ${workItem.eta.slice(0, 10)}.`);

  return pieces.length > 0 ? pieces.join(' ') : null;
}

function isRecoverableAdoReadError(err: unknown): boolean {
  return err instanceof DevAzureHttpError || err instanceof DevAzureTimeoutError || err instanceof TypeError;
}

function buildDegradedAdoProjection(statusDetail: string): AdoSupportProjection {
  return {
    status: 'ADO unavailable',
    statusDetail,
    statusTag: null,
    sprint: null,
    sprintStart: null,
    sprintEnd: null,
    eta: null,
    syncHealth: ADO_SYNC_HEALTH_TAGS.warning,
  };
}

async function buildLinkedFieldProjection(
  config: AppConfig,
  ado: DevAzureClient,
  workItemId: number,
): Promise<LinkedFieldProjection> {
  const workItemUrl = buildWorkItemUrl(config.devAzure.orgUrl, config.devAzure.project, workItemId);
  const lastSyncAt = new Date().toISOString();

  try {
    const snapshot = await ado.getWorkItem(workItemId);
    if (!snapshot) {
      const degraded = buildDegradedAdoProjection('Linked ADO work item could not be found.');
      return {
        fields: buildLinkedAdoZendeskFields(workItemId, { ...degraded, workItemUrl, lastSyncAt }),
        fingerprint: null,
        workItemUrl,
      };
    }

    const projection = await buildAdoSupportProjection(config, ado, snapshot);
    return {
      fields: buildLinkedAdoZendeskFields(workItemId, { ...projection, lastSyncAt }),
      fingerprint: projection.fingerprint,
      workItemUrl: projection.workItemUrl,
    };
  } catch (err) {
    if (!isRecoverableAdoReadError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Live ADO details could not be loaded.';
    console.warn(`[app] degraded linked field projection workItem=${workItemId}: ${message}`);
    const degraded = buildDegradedAdoProjection('Live ADO details could not be loaded. Try Refresh.');
    return {
      fields: buildLinkedAdoZendeskFields(workItemId, { ...degraded, workItemUrl, lastSyncAt }),
      fingerprint: null,
      workItemUrl,
    };
  }
}

export async function buildAdoSupportProjection(
  config: AppConfig,
  ado: DevAzureClient,
  snapshot: AdoWorkItemSnapshot,
): Promise<AdoSupportProjection & { fingerprint: string; workItemUrl: string }> {
  let iteration: Awaited<ReturnType<typeof fetchIterationMetadata>> = null;
  let syncHealth: string | null = ADO_SYNC_HEALTH_TAGS.ok;
  try {
    iteration = await fetchIterationMetadata(ado, config.devAzure.project, snapshot.iterationPath);
  } catch (err) {
    if (!isRecoverableAdoReadError(err)) {
      throw err;
    }
    syncHealth = ADO_SYNC_HEALTH_TAGS.warning;
  }

  const dated = hasDatedRange(iteration);
  const statusTag = deriveAdoStatus({
    workItemState: snapshot.state,
    hasDatedSprint: dated,
  });
  const sprint = dated ? iteration!.displayName : null;
  const sprintStart = dated ? iteration!.startDate : null;
  const sprintEnd = dated ? iteration!.finishDate : null;
  const statusDetail = formatStatusDetail({
    status: statusTag,
    workItemState: snapshot.state,
    sprintName: sprint,
    sprintStart,
    sprintEnd,
  });
  const workItemUrl = buildWorkItemUrl(config.devAzure.orgUrl, config.devAzure.project, snapshot.id);
  const eta = normalizeAdoDate(snapshot.targetDate) ?? sprintEnd;
  const fingerprint = computeAdoFingerprint({
    workItemState: snapshot.state,
    status: statusTag,
    statusDetail,
    sprintName: sprint,
    sprintStart,
    sprintEnd,
    eta,
    workItemUrl,
  });

  return {
    status: humanizeTag(statusTag),
    statusDetail,
    statusTag,
    sprint,
    sprintStart,
    sprintEnd,
    eta,
    syncHealth,
    fingerprint,
    workItemUrl,
  };
}

async function loadAdoSummaryContext(
  config: AppConfig,
  ado: DevAzureClient,
  link: SyncLinkRow | null,
): Promise<AdoSummaryContext> {
  if (!link) {
    return { adoSnapshot: null, adoProjection: null, recentComments: [] };
  }

  try {
    const [adoSnapshot, recentComments] = await Promise.all([
      ado.getWorkItem(link.ADO_WORK_ITEM_ID),
      loadRecentAdoComments(ado, link.ADO_WORK_ITEM_ID),
    ]);
    if (!adoSnapshot) {
      return {
        adoSnapshot: null,
        adoProjection: buildDegradedAdoProjection('Linked ADO work item could not be found.'),
        recentComments,
      };
    }
    const adoProjection = await buildAdoSupportProjection(config, ado, adoSnapshot);
    return { adoSnapshot, adoProjection, recentComments };
  } catch (err) {
    if (!isRecoverableAdoReadError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Live ADO details could not be loaded.';
    console.warn(`[app] degraded ADO summary ticket link=${link.ADO_WORK_ITEM_ID}: ${message}`);
    return {
      adoSnapshot: null,
      adoProjection: buildDegradedAdoProjection('Live ADO details could not be loaded. Try Refresh.'),
      recentComments: [],
    };
  }
}

async function loadRecentAdoComments(ado: DevAzureClient, workItemId: number): Promise<AdoWorkItemComment[]> {
  try {
    const comments = await ado.getWorkItemComments(workItemId, 10);
    return prepareRecentAdoComments(comments, 3);
  } catch (err) {
    if (!isRecoverableAdoReadError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Recent ADO comments could not be loaded.';
    console.warn(`[app] degraded ADO comments workItem=${workItemId}: ${message}`);
    return [];
  }
}

export function buildSummaryFromSnapshot(
  ticketId: number,
  link: SyncLinkRow | null,
  snapshot: ZendeskTicketSnapshot | null,
  orgUrl: string,
  adoSnapshot: AdoWorkItemSnapshot | null = null,
  adoProjection: AdoSupportProjection | null = null,
  recentComments: AdoWorkItemComment[] = [],
): SummaryResponse {
  if (!link) {
    return { ok: true, ticketId, linked: false };
  }

  const fields = snapshot?.customFields ?? {};
  const byTag = (tag: string): unknown => fields[ZENDESK_FIELD_IDS[tag]];

  const url = buildWorkItemUrl(orgUrl, link.ADO_PROJECT, link.ADO_WORK_ITEM_ID);
  const statusTag = adoProjection?.statusTag ?? coerceString(byTag('ado_status'));
  const statusDetail = adoProjection?.statusDetail ?? coerceString(byTag('ado_status_detail'));
  const status = adoProjection?.status ?? statusDetail ?? humanizeTag(statusTag);
  const sprint = adoProjection?.sprint ?? coerceString(byTag('ado_sprint'));
  const eta = adoProjection?.eta ?? coerceIso(byTag('ado_eta'));
  const syncHealth = adoProjection?.syncHealth ?? coerceString(byTag('ado_sync_health'));
  const lastSyncAt = latestIso(byTag('ado_last_sync_at'), link.LAST_SYNCED_AT);
  const assignedTo = adoSnapshot?.assignedTo ?? null;
  const customerUpdate = buildCustomerUpdate({ status, statusDetail, assignedTo, sprint, eta });

  return {
    ok: true,
    ticketId,
    linked: true,
    workItem: {
      id: link.ADO_WORK_ITEM_ID,
      url,
      title: adoSnapshot?.title ?? null,
      workItemType: adoSnapshot?.workItemType ?? null,
      state: adoSnapshot?.state ?? null,
      reason: adoSnapshot?.reason ?? null,
      assignedTo,
      areaPath: adoSnapshot?.areaPath ?? null,
      iterationPath: adoSnapshot?.iterationPath ?? null,
      priority: adoSnapshot?.priority ?? null,
      severity: adoSnapshot?.severity ?? null,
      product: adoSnapshot?.product ?? null,
      client: adoSnapshot?.client ?? null,
      crf: adoSnapshot?.crf ?? null,
      xref: adoSnapshot?.xref ?? null,
      bucket: adoSnapshot?.bucket ?? null,
      unplanned: adoSnapshot?.unplanned ?? null,
      tags: adoSnapshot?.tags ?? [],
      createdAt: adoSnapshot?.createdAt ?? null,
      changedAt: adoSnapshot?.changedAt ?? null,
      status,
      statusDetail,
      statusTag,
      sprint,
      eta,
      syncHealth,
      lastSyncAt,
      lastSyncSource: coerceString(link.LAST_SYNC_SOURCE),
      customerUpdate,
      recentComments: prepareRecentAdoComments(recentComments, 3),
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
  ado: DevAzureClient,
): Promise<SummaryResponse> {
  const ticketId = validateTicketId(ticketIdRaw);
  const link = await loadActiveLink(ticketIdRaw);
  const { adoSnapshot, adoProjection, recentComments } = await loadAdoSummaryContext(config, ado, link);
  return buildSummaryFromSnapshot(
    ticketId,
    link,
    null,
    config.devAzure.orgUrl,
    adoSnapshot,
    adoProjection,
    recentComments,
  );
}

// ------------------------------------------------------------------------
// Ticket API response -> ZendeskTicketEvent
// ------------------------------------------------------------------------

/**
 * Map a Zendesk API `tickets.show` response to the same ZendeskTicketEvent
 * shape the webhook parser produces. This lets the sidebar-click create path
 * reuse `buildSyncPlan` unchanged.
 *
 * Routing-input custom fields (`product`, `org_name`, `case_type`, `crf`, `xref`) are
 * read from `custom_fields` by ID so sidebar-click create uses the same live
 * support form data that agents see in Zendesk.
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
    ticketFormId: typeof ticket.ticket_form_id === 'number' ? ticket.ticket_form_id : null,
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
    orgName: coerceString(customByFieldId[ZENDESK_ROUTING_FIELD_IDS.org_name]),
    caseType: coerceString(customByFieldId[ZENDESK_ROUTING_FIELD_IDS.case_type]),
    crf: coerceString(customByFieldId[ZENDESK_ROUTING_FIELD_IDS.crf]),
    xref: coerceString(customByFieldId[ZENDESK_ROUTING_FIELD_IDS.xref]),
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
    commentPublic: null,
    commentAttachments: [],
  };
}

// ------------------------------------------------------------------------
// POST /app/ado/tickets/:id/create
// ------------------------------------------------------------------------

async function freshSummary(
  config: AppConfig,
  ticketIdRaw: string,
  ado: DevAzureClient,
): Promise<SummaryResponse> {
  const link = await loadActiveLink(ticketIdRaw);
  const { adoSnapshot, adoProjection, recentComments } = await loadAdoSummaryContext(config, ado, link);
  return buildSummaryFromSnapshot(
    Number(ticketIdRaw),
    link,
    null,
    config.devAzure.orgUrl,
    adoSnapshot,
    adoProjection,
    recentComments,
  );
}

export interface CreateResult {
  action: 'created' | 'already_linked';
  summary: SummaryResponse;
}

const HANDOFF_FIELD_LIMIT = 6000;

function normalizeHandoffString(value: unknown, label: string): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  if (normalized.length > HANDOFF_FIELD_LIMIT) {
    throw new AppActionError(`${label} must be ${HANDOFF_FIELD_LIMIT} characters or fewer`, 400);
  }
  return normalized;
}

function normalizeSupportHandoff(value: unknown, actor?: SidebarActor | null): SupportHandoffFields | null {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const submittedBy = actor && (actor.name || actor.email || actor.userId)
    ? formatSidebarActor(actor)
    : null;
  const handoff: SupportHandoffFields = {
    reproSteps: normalizeHandoffString(raw.reproSteps, 'Repro steps'),
    systemInfo: normalizeHandoffString(raw.systemInfo, 'System info'),
    finalResults: normalizeHandoffString(raw.finalResults, 'Final result'),
    acceptanceCriteria: normalizeHandoffString(raw.acceptanceCriteria, 'Acceptance criteria'),
    submittedBy,
  };

  return Object.values(handoff).some((field) => field != null && field.trim() !== '') ? handoff : null;
}

export async function createAdoFromTicket(
  config: AppConfig,
  ticketIdRaw: string,
  ado: DevAzureClient,
  actor?: SidebarActor | null,
  handoffInput?: unknown,
): Promise<CreateResult> {
  const ticketId = validateTicketId(ticketIdRaw);

  const existingLink = await loadActiveLink(ticketIdRaw);
  if (existingLink) {
    return { action: 'already_linked', summary: await freshSummary(config, ticketIdRaw, ado) };
  }

  const fullTicket = await getTicketRaw(config, ticketId);
  if (!fullTicket) {
    throw new AppActionError(`Zendesk ticket #${ticketId} not found`, 404);
  }
  let event = ticketToEvent(fullTicket, 'sidebar_create');
  if (!event.detail.description) {
    const initialComment = await getInitialTicketComment(config, ticketId);
    if (initialComment?.body) {
      event = {
        ...event,
        detail: {
          ...event.detail,
          description: initialComment.body,
        },
      };
    }
  }
  event = {
    ...event,
    supportHandoff: normalizeSupportHandoff(handoffInput, actor),
  };

  const existingWorkItem = await ado.findWorkItemByZendeskTicketId(event.detail.id);
  const plan = buildSyncPlan(event, config, existingWorkItem);
  if (plan.action === 'noop') {
    throw new AppActionError(`Cannot create: ${plan.reason}`, 400);
  }

  const result = plan.action === 'create'
    ? await ado.createWorkItem(plan.workItemType, plan.operations)
    : await ado.updateWorkItem(existingWorkItem!.id, plan.operations);
  const linkedProjection = await buildLinkedFieldProjection(config, ado, Number(result.id));

  await execute(
    `INSERT INTO SYNC_LINK (ZENDESK_TICKET_ID, ADO_ORG, ADO_PROJECT, ADO_WORK_ITEM_ID, LINK_MODE, LAST_SYNC_SOURCE, LAST_SYNCED_AT, LAST_ADO_FINGERPRINT)
     VALUES (:ticketId, :org, :project, :workItemId, :linkMode, 'zendesk', SYSTIMESTAMP, :fingerprint)`,
    {
      ticketId: event.detail.id,
      org: config.devAzure.orgUrl,
      project: config.devAzure.project,
      workItemId: Number(result.id),
      linkMode: plan.action === 'create' ? 'created' : 'linked',
      fingerprint: linkedProjection.fingerprint,
    },
  );

  await updateTicketWithNote(
    config,
    event.detail.id,
    linkedProjection.fields,
    [
      `[Synced by sidebar] Linked to Azure DevOps ${plan.workItemType} #${result.id}`,
      sidebarActorLine(actor),
      linkedProjection.workItemUrl,
    ].join('\n'),
  );

  await execute(
    `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
     VALUES (:action, 'agent', 'zendesk', 'ado', :ticketId, :workItemId, :summary)`,
    {
      action: 'sidebar_create',
      ticketId: event.detail.id,
      workItemId: result.id,
      summary: `${formatSidebarActorAuditSummary(actor)} initiated create: ${plan.workItemType} #${result.id} from ticket #${event.detail.id}`,
    },
  );

  return { action: 'created', summary: await freshSummary(config, ticketIdRaw, ado) };
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
  actor?: SidebarActor | null,
): Promise<LinkResult> {
  const ticketId = validateTicketId(ticketIdRaw);
  const workItemId = parseWorkItemReference(reference);

  const existingLink = await loadActiveLink(ticketIdRaw);
  if (existingLink) {
    return { action: 'already_linked', summary: await freshSummary(config, ticketIdRaw, ado) };
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

  const projection = await buildAdoSupportProjection(config, ado, snapshot);

  await updateTicketWithNote(
    config,
    String(ticketId),
    buildLinkedAdoZendeskFields(workItemId, { ...projection, lastSyncAt: new Date().toISOString() }),
    [
      `[Synced by sidebar] Linked to existing Azure DevOps work item #${workItemId}`,
      sidebarActorLine(actor),
      projection.workItemUrl,
    ].join('\n'),
  );

  await execute(
    `UPDATE SYNC_LINK
        SET LAST_ADO_FINGERPRINT = :fp
      WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { fp: projection.fingerprint, ticketId: String(ticketId) },
  );

  await execute(
    `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
     VALUES ('sidebar_link', 'agent', 'ado', 'zendesk', :ticketId, :workItemId, :summary)`,
    {
      ticketId: String(ticketId),
      workItemId: String(workItemId),
      summary: `${formatSidebarActorAuditSummary(actor)} initiated link: ticket #${ticketId} → ADO #${workItemId}`,
    },
  );

  return { action: 'linked', summary: await freshSummary(config, ticketIdRaw, ado) };
}

// ------------------------------------------------------------------------
// POST /app/ado/tickets/:id/unlink
// ------------------------------------------------------------------------

export interface UnlinkResult {
  action: 'unlinked' | 'already_unlinked';
  summary: SummaryResponse;
}

async function restoreZendeskTag(
  ado: DevAzureClient,
  workItemId: number,
  zendeskTag: string,
): Promise<void> {
  const current = await ado.getWorkItem(workItemId);
  if (!current || current.tags.includes(zendeskTag)) return;

  await ado.updateWorkItem(String(workItemId), [
    { op: 'test', path: '/rev', value: current.rev },
    { op: 'replace', path: '/fields/System.Tags', value: [...current.tags, zendeskTag].join('; ') },
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeZendeskTag(
  ado: DevAzureClient,
  workItemId: number,
  zendeskTag: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await ado.getWorkItem(workItemId);
    if (!current || !current.tags.includes(zendeskTag)) {
      return false;
    }

    const remainingTags = current.tags.filter((tag) => tag !== zendeskTag).join('; ');
    await ado.updateWorkItem(String(workItemId), [
      { op: 'test', path: '/rev', value: current.rev },
      { op: 'replace', path: '/fields/System.Tags', value: remainingTags },
    ]);

    await sleep(250 * (attempt + 1));
    const verified = await ado.getWorkItem(workItemId);
    if (!verified || !verified.tags.includes(zendeskTag)) {
      return true;
    }
  }

  throw new AppActionError(
    `Could not verify removal of ${zendeskTag} from ADO work item #${workItemId}`,
    502,
  );
}

async function markUnlinkPending(ticketId: number): Promise<void> {
  await execute(
    `UPDATE SYNC_LINK
        SET LAST_SYNC_SOURCE = 'unlink_pending',
            UPDATED_AT = SYSTIMESTAMP
      WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { ticketId: String(ticketId) },
  );
}

async function clearUnlinkPending(ticketId: number): Promise<void> {
  await execute(
    `UPDATE SYNC_LINK
        SET LAST_SYNC_SOURCE = 'zendesk',
            UPDATED_AT = SYSTIMESTAMP
      WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { ticketId: String(ticketId) },
  );
}

async function tryClearUnlinkPending(ticketId: number): Promise<void> {
  try {
    await clearUnlinkPending(ticketId);
  } catch (err) {
    console.error(`[app] failed to clear pending unlink state for ticket #${ticketId}:`, err);
  }
}

async function deactivateSyncLink(ticketId: number): Promise<void> {
  await execute(
    `UPDATE SYNC_LINK
        SET IS_ACTIVE = 0,
            LAST_SYNC_SOURCE = 'zendesk',
            LAST_SYNCED_AT = SYSTIMESTAMP,
            UPDATED_AT = SYSTIMESTAMP
      WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { ticketId: String(ticketId) },
  );
}

export async function unlinkAdoFromTicket(
  config: AppConfig,
  ticketIdRaw: string,
  ado: DevAzureClient,
  actor?: SidebarActor | null,
): Promise<UnlinkResult> {
  const ticketId = validateTicketId(ticketIdRaw);
  const link = await loadActiveLink(ticketIdRaw);
  if (!link) {
    return { action: 'already_unlinked', summary: await freshSummary(config, ticketIdRaw, ado) };
  }

  const workItemUrl = buildWorkItemUrl(config.devAzure.orgUrl, link.ADO_PROJECT, link.ADO_WORK_ITEM_ID);
  const zendeskTag = `zendesk:id:${ticketId}`;

  await markUnlinkPending(ticketId);

  try {
    await updateTicketWithNote(
      config,
      String(ticketId),
      buildClearedAdoZendeskFields(),
      [
        `[Synced by sidebar] Unlinked Azure DevOps work item #${link.ADO_WORK_ITEM_ID} from this Zendesk ticket.`,
        sidebarActorLine(actor),
        workItemUrl,
      ].join('\n'),
    );
  } catch (err) {
    await tryClearUnlinkPending(ticketId);
    throw err;
  }

  let adoTagRemoved = false;
  try {
    adoTagRemoved = await removeZendeskTag(ado, link.ADO_WORK_ITEM_ID, zendeskTag);
    await deactivateSyncLink(ticketId);
  } catch (err) {
    if (adoTagRemoved) {
      try {
        await restoreZendeskTag(ado, link.ADO_WORK_ITEM_ID, zendeskTag);
      } catch (restoreErr) {
        console.error(
          `[app] failed to restore ${zendeskTag} on ADO #${link.ADO_WORK_ITEM_ID} after unlink failure:`,
          restoreErr,
        );
      }
    }
    await tryClearUnlinkPending(ticketId);
    throw err;
  }

  await execute(
    `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
     VALUES ('sidebar_unlink', 'agent', 'zendesk', 'ado', :ticketId, :workItemId, :summary)`,
    {
      ticketId: String(ticketId),
      workItemId: String(link.ADO_WORK_ITEM_ID),
      summary: `${formatSidebarActorAuditSummary(actor)} initiated unlink: ticket #${ticketId} from ADO #${link.ADO_WORK_ITEM_ID}`,
    },
  );

  return { action: 'unlinked', summary: await freshSummary(config, ticketIdRaw, ado) };
}

export interface CommentResult {
  action: 'commented';
  summary: SummaryResponse;
}

function buildAdoDiscussionComment(
  ticketId: number,
  comment: string,
  zendeskBaseUrl: string | undefined,
  actor?: SidebarActor | null,
): string {
  const ticketUrl = zendeskBaseUrl ? `${zendeskBaseUrl.replace(/\/$/, '')}/agent/tickets/${ticketId}` : null;
  const lines = [
    '[Synced from Zendesk by integration]',
    `Support comment from Zendesk #${ticketId}`,
    `Submitted by: ${formatSidebarActor(actor)}`,
    '',
    comment,
  ];

  if (ticketUrl) {
    lines.push('', `[Open Zendesk ticket](${ticketUrl})`);
  }

  return lines.join('\n');
}

export async function addAdoCommentFromTicket(
  config: AppConfig,
  ticketIdRaw: string,
  comment: string,
  ado: DevAzureClient,
  actor?: SidebarActor | null,
): Promise<CommentResult> {
  const ticketId = validateTicketId(ticketIdRaw);
  const normalizedComment = comment.trim();
  if (!normalizedComment) {
    throw new AppActionError('Comment cannot be empty', 400);
  }
  if (normalizedComment.length > 4000) {
    throw new AppActionError('Comment must be 4000 characters or fewer', 400);
  }

  const link = await loadActiveLink(ticketIdRaw);
  if (!link) {
    throw new AppActionError(`Ticket #${ticketId} is not linked to an ADO work item`, 409);
  }

  try {
    await ado.addWorkItemComment(
      link.ADO_WORK_ITEM_ID,
      buildAdoDiscussionComment(ticketId, normalizedComment, config.zendesk.baseUrl, actor),
    );
  } catch (err) {
    if (err instanceof DevAzureHttpError) {
      throw new AppActionError(
        `ADO comment failed for work item #${link.ADO_WORK_ITEM_ID}: ${err.message}`,
        err.status,
      );
    }
    throw err;
  }

  await execute(
    `UPDATE SYNC_LINK
        SET LAST_SYNC_SOURCE = 'zendesk',
            LAST_SYNCED_AT = SYSTIMESTAMP,
            UPDATED_AT = SYSTIMESTAMP
      WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { ticketId: String(ticketId) },
  );

  await updateTicketWithNote(
    config,
    String(ticketId),
    {},
    [
      `[Synced by sidebar] Added ADO discussion comment to Azure DevOps work item #${link.ADO_WORK_ITEM_ID}.`,
      sidebarActorLine(actor),
      '',
      normalizedComment,
    ].join('\n'),
  );

  await execute(
    `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
     VALUES ('sidebar_ado_comment', 'agent', 'zendesk', 'ado', :ticketId, :workItemId, :summary)`,
    {
      ticketId: String(ticketId),
      workItemId: String(link.ADO_WORK_ITEM_ID),
      summary: `${formatSidebarActorAuditSummary(actor)} added ADO discussion comment from Zendesk ticket #${ticketId}`,
    },
  );

  return { action: 'commented', summary: await freshSummary(config, ticketIdRaw, ado) };
}
