import nodeZendesk from 'node-zendesk';
const { createClient } = nodeZendesk;
import type { AppConfig } from '../types.js';

export interface ZendeskFieldMapping {
  devFunnelNumber?: string | null;
  adoWorkItemId?: number | null;
  adoWorkItemUrl?: string | null;
  adoStatus?: string | null;
  adoStatusDetail?: string | null;
  adoSprint?: string | null;
  adoSprintStart?: string | null;
  adoSprintEnd?: string | null;
  adoEta?: string | null;
  adoSyncHealth?: string | null;
  adoLastSyncAt?: string | null;
}

// Zendesk field ID map — populated via setFieldIdMap()
let fieldIdMap: Record<string, number> = {};

export function setFieldIdMap(map: Record<string, number>): void {
  fieldIdMap = map;
}

// Cached client instance — created once, reused across all calls
let cachedClient: ReturnType<typeof createClient> | null = null;

function getClient(config: AppConfig) {
  if (cachedClient) return cachedClient;

  const baseUrl = config.zendesk.baseUrl;
  const username = config.zendesk.apiUsername;
  const token = config.zendesk.apiToken;
  if (!baseUrl || !username || !token) {
    throw new Error('Zendesk API config missing: ZENDESK_BASE_URL, ZENDESK_API_USERNAME, and ZENDESK_API_TOKEN are all required');
  }

  cachedClient = createClient({
    username,
    token,
    endpointUri: `${baseUrl.replace(/\/$/, '')}/api/v2`,
  });
  return cachedClient;
}

export interface ZendeskTicketSnapshot {
  id: number;
  subject: string | null;
  customFields: Record<number, unknown>;
}

export async function getTicketRaw(config: AppConfig, ticketId: number | string): Promise<Record<string, unknown> | null> {
  try {
    const result = (await getClient(config).tickets.show(Number(ticketId))) as any;
    const ticket = result?.ticket ?? result;
    if (!ticket || typeof ticket !== 'object') return null;
    return ticket as Record<string, unknown>;
  } catch (err: any) {
    if (err?.statusCode === 404 || err?.result?.statusCode === 404) return null;
    throw err;
  }
}

export async function getTicket(config: AppConfig, ticketId: number | string): Promise<ZendeskTicketSnapshot | null> {
  const ticket = await getTicketRaw(config, ticketId);
  if (!ticket) return null;
  const customFields: Record<number, unknown> = {};
  for (const f of (ticket.custom_fields ?? []) as Array<{ id: number; value: unknown }>) {
    customFields[f.id] = f.value;
  }
  return { id: Number(ticket.id), subject: (ticket.subject as string | null | undefined) ?? null, customFields };
}

export async function createTicketField(
  config: AppConfig,
  field: { title: string; type: string; tag?: string; custom_field_options?: Array<{ name: string; value: string }> },
) {
  return getClient(config).ticketfields.create({ ticket_field: field });
}

export async function listTicketFields(config: AppConfig) {
  return getClient(config).ticketfields.list();
}

/**
 * Update ticket custom fields and optionally add a private note in a single API call.
 * Merging these avoids two round-trips and halves Zendesk rate-limit consumption.
 */
export async function updateTicketWithNote(
  config: AppConfig,
  ticketId: string,
  fields: ZendeskFieldMapping,
  privateNote?: string,
): Promise<void> {
  if (Object.keys(fieldIdMap).length === 0) {
    throw new Error('Zendesk field ID map not initialized — call setFieldIdMap() first');
  }

  const customFields: Array<{ id: number; value: string | number | boolean | null }> = [];

  const mapping: Array<[keyof ZendeskFieldMapping, string]> = [
    ['devFunnelNumber', 'dev_funnel_number'],
    ['adoWorkItemId', 'ado_work_item_id'],
    ['adoWorkItemUrl', 'ado_work_item_url'],
    ['adoStatus', 'ado_status'],
    ['adoStatusDetail', 'ado_status_detail'],
    ['adoSprint', 'ado_sprint'],
    ['adoSprintStart', 'ado_sprint_start'],
    ['adoSprintEnd', 'ado_sprint_end'],
    ['adoEta', 'ado_eta'],
    ['adoSyncHealth', 'ado_sync_health'],
    ['adoLastSyncAt', 'ado_last_sync_at'],
  ];

  for (const [fieldKey, mapKey] of mapping) {
    if (fieldKey in fields && fieldIdMap[mapKey]) {
      customFields.push({ id: fieldIdMap[mapKey], value: fields[fieldKey] ?? null });
    }
  }

  const ticket: Record<string, unknown> = {};
  if (customFields.length > 0) {
    ticket.custom_fields = customFields;
  }
  if (privateNote) {
    ticket.comment = { body: privateNote, public: false };
  }

  if (Object.keys(ticket).length === 0) return;

  await getClient(config).tickets.update(Number(ticketId), { ticket } as any);
}

export async function attachFieldsToForm(
  config: AppConfig,
  formId: number,
  fieldIds: number[],
): Promise<void> {
  const client = getClient(config);
  const form = await client.ticketforms.show(formId);
  const existing: number[] = (form as any)?.ticket_form?.ticket_field_ids ?? [];
  const merged = [...new Set([...existing, ...fieldIds])];
  await client.ticketforms.update(formId, {
    ticket_form: { ticket_field_ids: merged },
  });
}
