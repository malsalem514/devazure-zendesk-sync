import {
  ADO_SYNC_HEALTH_TAGS,
  ADO_STATUS_TAGS,
  computeAdoFingerprint,
  deriveAdoStatus,
  fetchIterationMetadata,
  formatStatusDetail,
  hasDatedRange,
  type AdoStatusTag,
} from './ado-status.js';
import { cleanAdoCommentText, isIntegrationAdoComment } from './ado-comments.js';
import { buildLinkedAdoZendeskFields } from './ado-zendesk-fields.js';
import { DevAzureClient, DevAzureHttpError, DevAzureTimeoutError } from './devazure-client.js';
import { execute, query } from './lib/oracle.js';
import {
  addPrivateNote,
  downloadZendeskAttachment,
  getLatestTicketComment,
  updateTicketWithNote,
  setFieldIdMap,
} from './lib/zendesk-api.js';
import { buildSyncPlan, shouldSyncZendeskCommentToAdo } from './sync-planner.js';
import { parseZendeskTicketEvent } from './zendesk-event-parser.js';
import { ZENDESK_FIELD_IDS } from './zendesk-field-ids.js';
import type { AppConfig, ExistingWorkItem, ZendeskCommentAttachment, ZendeskTicketEvent } from './types.js';
import { JOB_TYPES, type JobHandler } from './worker.js';

setFieldIdMap(ZENDESK_FIELD_IDS);

let cachedAdoClient: DevAzureClient | null = null;

function getAdoClient(config: AppConfig): DevAzureClient {
  if (!cachedAdoClient) {
    cachedAdoClient = new DevAzureClient(config.devAzure);
  }
  return cachedAdoClient;
}

function isRecoverableAdoReadError(err: unknown): boolean {
  return err instanceof DevAzureHttpError || err instanceof DevAzureTimeoutError || err instanceof TypeError;
}

function isZendeskCommentEvent(event: ZendeskTicketEvent): boolean {
  return event.type.endsWith('ticket.comment_added') || event.commentBody != null;
}

function isZendeskCommentAddedEvent(event: ZendeskTicketEvent): boolean {
  return event.type.endsWith('ticket.comment_added');
}

function buildAdoCommentFromZendesk(event: ZendeskTicketEvent, config: AppConfig): string {
  const ticketUrl = config.zendesk.baseUrl
    ? `${config.zendesk.baseUrl.replace(/\/$/, '')}/agent/tickets/${event.detail.id}`
    : null;
  const comment = (event.commentBody ?? '').replace(/\B#sync\b/ig, '').trim();
  return [
    '[Synced from Zendesk by integration]',
    `Zendesk ticket #${event.detail.id}${ticketUrl ? `: ${ticketUrl}` : ''}`,
    '',
    comment,
  ].join('\n');
}

async function hydrateZendeskCommentEvent(
  config: AppConfig,
  event: ZendeskTicketEvent,
): Promise<ZendeskTicketEvent> {
  if (!isZendeskCommentAddedEvent(event)) {
    return event;
  }

  const latest = await getLatestTicketComment(config, event.detail.id);
  if (!latest) {
    console.warn(`[job] comment event ticket=${event.detail.id} could not load latest Zendesk comment`);
    return event;
  }

  return {
    ...event,
    commentId: latest.id,
    commentBody: latest.body,
    commentPublic: latest.public,
    commentAttachments: latest.attachments,
  };
}

async function hasSyncedComment(sourceSystem: string, sourceCommentId: string, targetSystem: string): Promise<boolean> {
  const rows = await query<{ FOUND: number }>(
    `SELECT 1 AS FOUND
       FROM COMMENT_SYNC_MAP
      WHERE SOURCE_SYSTEM = :sourceSystem
        AND SOURCE_COMMENT_ID = :sourceCommentId
        AND TARGET_SYSTEM = :targetSystem`,
    { sourceSystem, sourceCommentId, targetSystem },
  );
  return rows.length > 0;
}

async function recordSyncedComment(params: {
  sourceSystem: string;
  sourceCommentId: string;
  targetSystem: string;
  targetCommentId: string | null;
  ticketId: string;
  workItemId: number;
}): Promise<void> {
  await execute(
    `INSERT INTO COMMENT_SYNC_MAP
       (SOURCE_SYSTEM, SOURCE_COMMENT_ID, TARGET_SYSTEM, TARGET_COMMENT_ID, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID)
     VALUES
       (:sourceSystem, :sourceCommentId, :targetSystem, :targetCommentId, :ticketId, :workItemId)`,
    params,
  );
}

async function hasSyncedAttachment(sourceAttachmentId: string): Promise<boolean> {
  const rows = await query<{ FOUND: number }>(
    `SELECT 1 AS FOUND
       FROM ATTACHMENT_SYNC_MAP
      WHERE SOURCE_SYSTEM = 'zendesk'
        AND SOURCE_ATTACHMENT_ID = :sourceAttachmentId
        AND TARGET_SYSTEM = 'ado'`,
    { sourceAttachmentId },
  );
  return rows.length > 0;
}

async function recordSyncedAttachment(params: {
  sourceAttachmentId: string;
  targetAttachmentUrl: string | null;
  ticketId: string;
  workItemId: number;
  fileName: string;
}): Promise<void> {
  await execute(
    `INSERT INTO ATTACHMENT_SYNC_MAP
       (SOURCE_SYSTEM, SOURCE_ATTACHMENT_ID, TARGET_SYSTEM, TARGET_ATTACHMENT_URL, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, FILE_NAME)
     VALUES
       ('zendesk', :sourceAttachmentId, 'ado', :targetAttachmentUrl, :ticketId, :workItemId, :fileName)`,
    params,
  );
}

async function syncZendeskAttachmentsToAdo(
  config: AppConfig,
  client: DevAzureClient,
  event: ZendeskTicketEvent,
  workItemId: number,
  attachments: ZendeskCommentAttachment[],
): Promise<number> {
  let synced = 0;
  for (const attachment of attachments) {
    if (attachment.size != null && attachment.size > config.maxAttachmentBytes) {
      console.warn(`[job] attachment too large ticket=${event.detail.id} attachment=${attachment.id} size=${attachment.size}`);
      continue;
    }
    if (await hasSyncedAttachment(attachment.id)) {
      continue;
    }

    const downloaded = await downloadZendeskAttachment(config, attachment.contentUrl, config.maxAttachmentBytes);
    const uploaded = await client.uploadAttachment(
      attachment.fileName,
      downloaded.bytes,
      downloaded.contentType ?? attachment.contentType,
    );
    await client.updateWorkItem(String(workItemId), [{
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'AttachedFile',
        url: uploaded.url,
        attributes: {
          comment: `Zendesk #${event.detail.id} attachment: ${attachment.fileName}`,
        },
      },
    }]);
    await recordSyncedAttachment({
      sourceAttachmentId: attachment.id,
      targetAttachmentUrl: uploaded.url,
      ticketId: event.detail.id,
      workItemId,
      fileName: attachment.fileName,
    });
    synced++;
  }
  return synced;
}

async function syncZendeskCommentAndAttachmentsToAdo(
  config: AppConfig,
  client: DevAzureClient,
  event: ZendeskTicketEvent,
  workItemId: number,
): Promise<{ commentSynced: boolean; attachmentsSynced: number }> {
  let commentSynced = false;
  const sourceCommentId = event.commentId ?? event.id;
  if (event.commentBody && shouldSyncZendeskCommentToAdo(event)) {
    if (!(await hasSyncedComment('zendesk', sourceCommentId, 'ado'))) {
      const comment = await client.addWorkItemComment(workItemId, buildAdoCommentFromZendesk(event, config));
      await recordSyncedComment({
        sourceSystem: 'zendesk',
        sourceCommentId,
        targetSystem: 'ado',
        targetCommentId: String(comment.id),
        ticketId: event.detail.id,
        workItemId,
      });
      commentSynced = true;
    }
  }

  const attachmentsSynced = (!event.type.endsWith('ticket.comment_added') || shouldSyncZendeskCommentToAdo(event))
    ? await syncZendeskAttachmentsToAdo(config, client, event, workItemId, event.commentAttachments)
    : 0;

  return { commentSynced, attachmentsSynced };
}

async function syncRecentAdoCommentsToZendesk(
  config: AppConfig,
  client: DevAzureClient,
  params: {
    ticketId: string;
    workItemId: number;
    workItemUrl: string;
    linkCreatedAt: Date;
    lastSyncedAt: Date | null;
  },
): Promise<number> {
  const comments = await client.getWorkItemComments(params.workItemId, 10);
  const minTime = Math.max(
    Date.now() - config.commentSyncMaxAgeHours * 60 * 60 * 1000,
    (params.lastSyncedAt ?? params.linkCreatedAt).getTime() - 5 * 60 * 1000,
  );

  let synced = 0;
  for (const comment of comments) {
    if (!comment.id || isIntegrationAdoComment(comment.text)) {
      continue;
    }
    const commentText = cleanAdoCommentText(comment.text);
    if (!commentText) {
      continue;
    }
    const createdAt = comment.createdAt ? new Date(comment.createdAt).getTime() : NaN;
    if (!Number.isFinite(createdAt) || createdAt < minTime) {
      continue;
    }
    const sourceCommentId = String(comment.id);
    if (await hasSyncedComment('ado', sourceCommentId, 'zendesk')) {
      continue;
    }

    await addPrivateNote(
      config,
      params.ticketId,
      [
        '[Synced by integration] ADO discussion comment',
        `Azure DevOps work item #${params.workItemId}: ${params.workItemUrl}`,
        comment.createdBy ? `Author: ${comment.createdBy}` : null,
        comment.createdAt ? `Created: ${comment.createdAt}` : null,
        '',
        commentText,
      ].filter((line): line is string => line != null).join('\n'),
    );
    await recordSyncedComment({
      sourceSystem: 'ado',
      sourceCommentId,
      targetSystem: 'zendesk',
      targetCommentId: null,
      ticketId: params.ticketId,
      workItemId: params.workItemId,
    });
    synced++;
  }
  return synced;
}

function normalizeAdoDate(value: unknown): string | null {
  if (value == null) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value).trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function buildLinkedFieldUpdate(
  config: AppConfig,
  client: DevAzureClient,
  workItemId: number,
): Promise<{
  fields: ReturnType<typeof buildLinkedAdoZendeskFields>;
  fingerprint: string | null;
  status: AdoStatusTag | null;
  statusDetail: string | null;
  workItemUrl: string;
}> {
  const workItemUrl = buildWorkItemUrl(config, workItemId);
  const lastSyncAt = new Date().toISOString();

  try {
    const snapshot = await client.getWorkItem(workItemId);
    if (!snapshot) {
      const statusDetail = 'Linked ADO work item could not be found.';
      return {
        fields: buildLinkedAdoZendeskFields(workItemId, {
          workItemUrl,
          statusDetail,
          syncHealth: ADO_SYNC_HEALTH_TAGS.warning,
          lastSyncAt,
        }),
        fingerprint: null,
        status: null,
        statusDetail,
        workItemUrl,
      };
    }

    let iteration: Awaited<ReturnType<typeof fetchIterationMetadata>> = null;
    let syncHealth: string | null = ADO_SYNC_HEALTH_TAGS.ok;
    try {
      iteration = await fetchIterationMetadata(client, config.devAzure.project, snapshot.iterationPath);
    } catch (err) {
      if (!isRecoverableAdoReadError(err)) {
        throw err;
      }
      syncHealth = ADO_SYNC_HEALTH_TAGS.warning;
    }

    const dated = hasDatedRange(iteration);
    const status = deriveAdoStatus({
      workItemState: snapshot.state,
      hasDatedSprint: dated,
    });
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
    const eta = normalizeAdoDate(snapshot.targetDate) ?? sprintEnd;
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

    return {
      fields: buildLinkedAdoZendeskFields(workItemId, {
        workItemUrl,
        statusTag: status,
        statusDetail,
        sprint: sprintName,
        sprintStart,
        sprintEnd,
        eta,
        syncHealth,
        lastSyncAt,
      }),
      fingerprint,
      status,
      statusDetail,
      workItemUrl,
    };
  } catch (err) {
    if (!isRecoverableAdoReadError(err)) {
      throw err;
    }
    const statusDetail = 'Live ADO details could not be loaded.';
    console.warn(`[job] degraded linked field projection workItem=${workItemId}: ${err instanceof Error ? err.message : statusDetail}`);
    return {
      fields: buildLinkedAdoZendeskFields(workItemId, {
        workItemUrl,
        statusDetail,
        syncHealth: ADO_SYNC_HEALTH_TAGS.warning,
        lastSyncAt,
      }),
      fingerprint: null,
      status: null,
      statusDetail,
      workItemUrl,
    };
  }
}

async function findExistingWorkItemForTicket(
  event: ZendeskTicketEvent,
  devAzureClient: DevAzureClient,
): Promise<ExistingWorkItem | null> {
  const linkedWorkItemId = await loadActiveWorkItemIdForTicket(event.detail.id);
  if (linkedWorkItemId != null) {
    const linkedSnapshot = await devAzureClient.getWorkItem(linkedWorkItemId);
    if (linkedSnapshot) {
      return { id: String(linkedWorkItemId), rev: linkedSnapshot.rev };
    }
  }

  return devAzureClient.findWorkItemByZendeskTicketId(event.detail.id);
}

async function loadActiveWorkItemIdForTicket(ticketId: string): Promise<number | null> {
  const linkRows = await query<{ ADO_WORK_ITEM_ID: number }>(
    `SELECT ADO_WORK_ITEM_ID
       FROM SYNC_LINK
      WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { ticketId },
  );

  const linkedWorkItemId = linkRows[0]?.ADO_WORK_ITEM_ID;
  return linkedWorkItemId == null ? null : Number(linkedWorkItemId);
}

async function handleSyncZendeskToAdo(
  _jobType: string,
  payload: unknown,
  config: AppConfig,
): Promise<void> {
  const { rawBody, ticketId } = payload as { rawBody: string; ticketId: string };

  const event = await hydrateZendeskCommentEvent(config, parseZendeskTicketEvent(rawBody));
  const devAzureClient = getAdoClient(config);

  if (isZendeskCommentAddedEvent(event)) {
    const linkedWorkItemId = await loadActiveWorkItemIdForTicket(event.detail.id);
    if (linkedWorkItemId == null) {
      console.log(`[job] noop for ticket=${ticketId}: comment event has no active ADO link`);
      return;
    }

    const syncResult = await syncZendeskCommentAndAttachmentsToAdo(
      config,
      devAzureClient,
      event,
      linkedWorkItemId,
    );

    await execute(
      `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
       VALUES ('sync_zendesk_comment_to_ado', 'integration', 'zendesk', 'ado', :ticketId, :workItemId, :summary)`,
      {
        ticketId: event.detail.id,
        workItemId: linkedWorkItemId,
        summary: `Zendesk comment ${event.commentId ?? event.id} processed for ADO #${linkedWorkItemId}: comment=${syncResult.commentSynced}, attachments=${syncResult.attachmentsSynced}`,
      },
    );
    console.log(
      `[job] comment event ticket=${ticketId} workItem=${linkedWorkItemId} comment=${syncResult.commentSynced} attachments=${syncResult.attachmentsSynced}`,
    );
    return;
  }

  const existingWorkItem = await findExistingWorkItemForTicket(event, devAzureClient);
  if (existingWorkItem && isZendeskCommentEvent(event)) {
    const syncResult = await syncZendeskCommentAndAttachmentsToAdo(
      config,
      devAzureClient,
      event,
      Number(existingWorkItem.id),
    );
    console.log(
      `[job] event comment content ticket=${ticketId} workItem=${existingWorkItem.id} comment=${syncResult.commentSynced} attachments=${syncResult.attachmentsSynced}`,
    );
  }

  const plan = buildSyncPlan(event, config, existingWorkItem);

  if (plan.action === 'noop') {
    console.log(`[job] noop for ticket=${ticketId}: ${plan.reason}`);
    return;
  }

  const result = plan.action === 'create'
    ? await devAzureClient.createWorkItem(plan.workItemType, plan.operations)
    : await devAzureClient.updateWorkItem(existingWorkItem!.id, plan.operations);
  const linkedFieldUpdate = await buildLinkedFieldUpdate(config, devAzureClient, Number(result.id));

  if (plan.action === 'create') {
    await syncZendeskCommentAndAttachmentsToAdo(config, devAzureClient, event, Number(result.id));
  }

  console.log(`[job] ${plan.action} ticket=${ticketId} workItem=${result.id}`);

  if (plan.action === 'create') {
    await execute(
      `INSERT INTO SYNC_LINK (ZENDESK_TICKET_ID, ADO_ORG, ADO_PROJECT, ADO_WORK_ITEM_ID, LINK_MODE, LAST_SYNC_SOURCE, LAST_SYNCED_AT, LAST_ADO_FINGERPRINT)
       VALUES (:ticketId, :org, :project, :workItemId, 'created', 'zendesk', SYSTIMESTAMP, :fingerprint)`,
      {
        ticketId: event.detail.id,
        org: config.devAzure.orgUrl,
        project: config.devAzure.project,
        workItemId: Number(result.id),
        fingerprint: linkedFieldUpdate.fingerprint,
      },
    );
  } else if (linkedFieldUpdate.fingerprint) {
    await execute(
      `UPDATE SYNC_LINK
          SET LAST_ADO_FINGERPRINT = :fp,
              LAST_SYNC_SOURCE = 'zendesk',
              LAST_SYNCED_AT = SYSTIMESTAMP,
              UPDATED_AT = SYSTIMESTAMP
        WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
      { fp: linkedFieldUpdate.fingerprint, ticketId: event.detail.id },
    );
  }

  await updateTicketWithNote(
    config,
    ticketId,
    linkedFieldUpdate.fields,
    `[Synced by integration] Linked to Azure DevOps ${plan.workItemType} #${result.id}\n${linkedFieldUpdate.workItemUrl}`,
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
 * Reverse-sync handler: pull fresh state from ADO, record a compact audit note,
 * and update the link fingerprint. The sidebar reads ADO live, so Zendesk no
 * longer stores mirrored ADO status/sprint/ETA fields.
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
    LAST_SYNCED_AT: Date | null;
    CREATED_AT: Date;
  }>(
    `SELECT ID, ZENDESK_TICKET_ID, ADO_PROJECT, LAST_ADO_FINGERPRINT, LAST_SYNCED_AT, CREATED_AT
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
  const dated = hasDatedRange(iteration);
  const status = deriveAdoStatus({
    workItemState: snapshot.state,
    hasDatedSprint: dated,
  });

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
  // BRD rule: explicit ADO target date wins; otherwise ETA mirrors sprint end.
  const eta = normalizeAdoDate(snapshot.targetDate) ?? sprintEnd;
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

  const syncedComments = await syncRecentAdoCommentsToZendesk(config, client, {
    ticketId: link.ZENDESK_TICKET_ID,
    workItemId,
    workItemUrl,
    linkCreatedAt: link.CREATED_AT,
    lastSyncedAt: link.LAST_SYNCED_AT,
  });

  if (fingerprint === link.LAST_ADO_FINGERPRINT) {
    if (syncedComments > 0) {
      await execute(
        `UPDATE SYNC_LINK
            SET LAST_SYNC_SOURCE = 'ado',
                LAST_SYNCED_AT = SYSTIMESTAMP,
                UPDATED_AT = SYSTIMESTAMP
          WHERE ID = :id`,
        { id: link.ID },
      );
      await execute(
        `INSERT INTO AUDIT_LOG (ACTION_TYPE, ACTOR_TYPE, SOURCE_SYSTEM, TARGET_SYSTEM, ZENDESK_TICKET_ID, ADO_WORK_ITEM_ID, SUMMARY)
         VALUES ('sync_ado_comment_to_zendesk', 'integration', 'ado', 'zendesk', :ticketId, :workItemId, :summary)`,
        {
          ticketId: link.ZENDESK_TICKET_ID,
          workItemId: String(workItemId),
          summary: `ADO #${workItemId} → ticket #${link.ZENDESK_TICKET_ID}: comments synced=${syncedComments}`,
        },
      );
      console.log(
        `[job] sync_ado_state_to_zendesk: fingerprint unchanged workItem=${workItemId} ticket=${link.ZENDESK_TICKET_ID} comments=${syncedComments}`,
      );
      return;
    }
    console.log(
      `[job] sync_ado_state_to_zendesk: fingerprint unchanged workItem=${workItemId} ticket=${link.ZENDESK_TICKET_ID} — noop`,
    );
    return;
  }

  const privateNote = buildReverseSyncNote(status, statusDetail, workItemUrl);

  await updateTicketWithNote(
    config,
    link.ZENDESK_TICKET_ID,
    buildLinkedAdoZendeskFields(workItemId, {
      workItemUrl,
      statusTag: status,
      statusDetail,
      sprint: sprintName,
      sprintStart,
      sprintEnd,
      eta,
      syncHealth: ADO_SYNC_HEALTH_TAGS.ok,
      lastSyncAt: new Date().toISOString(),
    }),
    privateNote,
    {
      customStatusId: status === ADO_STATUS_TAGS.supportReady
        ? config.zendesk.devCompletedStatusId
        : undefined,
    },
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
      summary: `ADO #${workItemId} → ticket #${link.ZENDESK_TICKET_ID}: ${status} (${statusDetail}); comments synced=${syncedComments}`,
    },
  );

  console.log(
    `[job] sync_ado_state_to_zendesk: workItem=${workItemId} ticket=${link.ZENDESK_TICKET_ID} status=${status} comments=${syncedComments}`,
  );
}

function buildWorkItemUrl(config: AppConfig, workItemId: string | number): string {
  return `${config.devAzure.orgUrl.replace(/\/$/, '')}/${encodeURIComponent(config.devAzure.project)}/_workitems/edit/${workItemId}`;
}

const STATUS_LABELS: Record<AdoStatusTag, string> = {
  [ADO_STATUS_TAGS.inDevBacklog]: 'In Dev Backlog',
  [ADO_STATUS_TAGS.scheduledInSprint]: 'Scheduled In Sprint',
  [ADO_STATUS_TAGS.devInProgress]: 'Dev In Progress',
  [ADO_STATUS_TAGS.onHold]: 'On Hold',
  [ADO_STATUS_TAGS.supportReady]: 'Support Ready',
};

function buildReverseSyncNote(status: AdoStatusTag, statusDetail: string, workItemUrl: string): string {
  return `[Synced by integration] ADO status → ${STATUS_LABELS[status]}: ${statusDetail}\n${workItemUrl}`;
}

export const jobHandlers: Record<string, JobHandler> = {
  [JOB_TYPES.createAdoFromZendesk]: handleSyncZendeskToAdo,
  [JOB_TYPES.updateAdoFromZendesk]: handleSyncZendeskToAdo,
  [JOB_TYPES.syncAdoStateToZendesk]: handleSyncAdoStateToZendesk,
};

export function dispatchJob(jobType: string, payload: unknown, config: AppConfig): Promise<void> {
  const handler = jobHandlers[jobType];
  if (!handler) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  return handler(jobType, payload, config);
}
