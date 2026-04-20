import { query } from './lib/oracle.js';
import { getTicket, type ZendeskTicketSnapshot } from './lib/zendesk-api.js';
import { ZENDESK_FIELD_IDS } from './zendesk-field-ids.js';
import type { AppConfig } from './types.js';

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

function buildWorkItemUrl(orgUrl: string, project: string, workItemId: number): string {
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

export async function getTicketSummary(
  config: AppConfig,
  ticketIdRaw: string,
): Promise<SummaryResponse> {
  if (!/^\d+$/.test(ticketIdRaw)) {
    throw new Error(`Invalid ticketId: ${ticketIdRaw}`);
  }
  const ticketId = Number(ticketIdRaw);

  const rows = await query<SyncLinkRow>(
    `SELECT ADO_ORG, ADO_PROJECT, ADO_WORK_ITEM_ID, LAST_SYNCED_AT, LAST_SYNC_SOURCE
     FROM SYNC_LINK
     WHERE ZENDESK_TICKET_ID = :ticketId AND IS_ACTIVE = 1`,
    { ticketId: ticketIdRaw },
  );
  const link = rows[0] ?? null;

  // Only hit Zendesk if we have a link — avoids wasted API calls for unlinked tickets.
  const snapshot = link ? await getTicket(config, ticketId) : null;

  return buildSummaryFromSnapshot(ticketId, link, snapshot, config.devAzure.orgUrl);
}
