import nodeZendesk from 'node-zendesk';
const { createClient } = nodeZendesk;
import type { AppConfig, ZendeskCommentAttachment } from '../types.js';

const ZENDESK_REQUEST_TIMEOUT_MS = 10_000;
const ZENDESK_ATTACHMENT_MAX_REDIRECTS = 3;

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

export interface ZendeskTicketUpdateOptions {
  customStatusId?: number | null;
}

// Zendesk field ID map — populated via setFieldIdMap()
let fieldIdMap: Record<string, number> = {};

export function setFieldIdMap(map: Record<string, number>): void {
  fieldIdMap = map;
}

// Cached client instance — created once, reused across all calls
let cachedClient: ReturnType<typeof createClient> | null = null;

async function zendeskTransport(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown },
): Promise<Response> {
  try {
    return await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body as any,
      signal: AbortSignal.timeout(ZENDESK_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
      throw new Error(`Zendesk ${options.method ?? 'GET'} request timed out after ${ZENDESK_REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}

export function adaptZendeskFetchResponse(response: Response) {
  return {
    json: () => response.json(),
    status: response.status,
    headers: {
      get: (name: string) => response.headers.get(name),
    },
    statusText: response.statusText,
  };
}

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
    transportConfig: {
      transportFn: zendeskTransport,
      responseAdapter: adaptZendeskFetchResponse,
    },
  } as any);
  return cachedClient;
}

export interface ZendeskTicketSnapshot {
  id: number;
  subject: string | null;
  customFields: Record<number, unknown>;
}

export interface ZendeskTicketCommentSnapshot {
  id: string;
  body: string | null;
  public: boolean | null;
  createdAt: string | null;
  attachments: ZendeskCommentAttachment[];
}

function buildZendeskAuthHeader(username: string, token: string): string {
  return `Basic ${Buffer.from(`${username}/token:${token}`, 'utf8').toString('base64')}`;
}

function requireZendeskApiConfig(config: AppConfig): { baseUrl: string; username: string; token: string } {
  const baseUrl = config.zendesk.baseUrl;
  const username = config.zendesk.apiUsername;
  const token = config.zendesk.apiToken;
  if (!baseUrl || !username || !token) {
    throw new Error('Zendesk API config missing: ZENDESK_BASE_URL, ZENDESK_API_USERNAME, and ZENDESK_API_TOKEN are all required');
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), username, token };
}

export function unwrapZendeskTicketResponse(result: unknown): Record<string, unknown> | null {
  if (!result || typeof result !== 'object') return null;
  const response = result as Record<string, unknown>;
  const nestedResult = response.result;
  const ticket =
    nestedResult && typeof nestedResult === 'object' && 'ticket' in nestedResult
      ? (nestedResult as Record<string, unknown>).ticket
      : response.ticket ?? nestedResult ?? response;

  return ticket && typeof ticket === 'object'
    ? ticket as Record<string, unknown>
    : null;
}

export async function getTicketRaw(config: AppConfig, ticketId: number | string): Promise<Record<string, unknown> | null> {
  try {
    const result = (await getClient(config).tickets.show(Number(ticketId))) as any;
    return unwrapZendeskTicketResponse(result);
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
  options: ZendeskTicketUpdateOptions = {},
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
  if (options.customStatusId) {
    ticket.custom_status_id = options.customStatusId;
  }

  if (Object.keys(ticket).length === 0) return;

  await getClient(config).tickets.update(Number(ticketId), { ticket } as any);
}

export async function addPrivateNote(
  config: AppConfig,
  ticketId: string,
  privateNote: string,
): Promise<string | null> {
  await getClient(config).tickets.update(Number(ticketId), {
    ticket: { comment: { body: privateNote, public: false } },
  } as any);
  return null;
}

function normalizeZendeskCommentAttachment(value: unknown): ZendeskCommentAttachment | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = raw.id == null ? null : String(raw.id);
  const fileName = raw.file_name ?? raw.filename ?? raw.name;
  const contentUrl = raw.content_url ?? raw.url;
  if (!id || typeof fileName !== 'string' || typeof contentUrl !== 'string') {
    return null;
  }

  const size = Number(raw.size);
  return {
    id,
    fileName,
    contentUrl,
    contentType: typeof raw.content_type === 'string' ? raw.content_type : null,
    size: Number.isFinite(size) ? size : null,
  };
}

function normalizeZendeskTicketComment(value: unknown): ZendeskTicketCommentSnapshot | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (raw.id == null) return null;
  const body = raw.plain_body ?? raw.body ?? raw.html_body;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.flatMap((attachment) => {
        const normalized = normalizeZendeskCommentAttachment(attachment);
        return normalized ? [normalized] : [];
      })
    : [];

  return {
    id: String(raw.id),
    body: typeof body === 'string' && body.trim() !== '' ? body : null,
    public: typeof raw.public === 'boolean' ? raw.public : null,
    createdAt: typeof raw.created_at === 'string' ? raw.created_at : null,
    attachments,
  };
}

export async function getLatestTicketComment(
  config: AppConfig,
  ticketId: string | number,
): Promise<ZendeskTicketCommentSnapshot | null> {
  const { baseUrl, username, token } = requireZendeskApiConfig(config);
  const url = new URL(`${baseUrl}/api/v2/tickets/${ticketId}/comments.json`);
  url.searchParams.set('sort_order', 'desc');
  url.searchParams.set('include_inline_images', 'true');

  const response = await fetch(url, {
    headers: {
      Authorization: buildZendeskAuthHeader(username, token),
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(ZENDESK_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Zendesk ticket comments lookup failed with ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json() as { comments?: unknown[] };
  const comments = (payload.comments ?? [])
    .flatMap((comment) => {
      const normalized = normalizeZendeskTicketComment(comment);
      return normalized ? [normalized] : [];
    })
    .sort((a, b) => {
      const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
      if (aTime !== bTime) return bTime - aTime;
      return Number(b.id) - Number(a.id);
    });

  return comments[0] ?? null;
}

export async function downloadZendeskAttachment(
  config: AppConfig,
  url: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; contentType: string | null }> {
  const { username, token } = requireZendeskApiConfig(config);

  const response = await fetchZendeskAttachment(config, url, username, token, 0);
  if (!response.ok) {
    throw new Error(`Zendesk attachment download failed with ${response.status}: ${await response.text()}`);
  }

  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    throw new Error(`Zendesk attachment is too large (${length} bytes; max ${maxBytes})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new Error(`Zendesk attachment is too large (${bytes.byteLength} bytes; max ${maxBytes})`);
  }

  return {
    bytes,
    contentType: response.headers.get('content-type'),
  };
}

export function validateZendeskAttachmentUrl(
  config: AppConfig,
  url: string,
): { url: URL; sendAuth: boolean } {
  const baseUrl = config.zendesk.baseUrl;
  if (!baseUrl) {
    throw new Error('Zendesk API config missing: ZENDESK_BASE_URL is required for attachment downloads');
  }

  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(`Blocked Zendesk attachment URL with non-HTTPS protocol: ${parsed.protocol}`);
  }

  const zendeskHost = new URL(baseUrl).hostname.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  if (host === zendeskHost) {
    return { url: parsed, sendAuth: true };
  }

  if (host.endsWith('.zdusercontent.com')) {
    return { url: parsed, sendAuth: false };
  }

  throw new Error(`Blocked Zendesk attachment URL outside approved hosts: ${parsed.hostname}`);
}

async function fetchZendeskAttachment(
  config: AppConfig,
  url: string,
  username: string,
  token: string,
  redirectCount: number,
): Promise<Response> {
  if (redirectCount > ZENDESK_ATTACHMENT_MAX_REDIRECTS) {
    throw new Error('Zendesk attachment download exceeded redirect limit');
  }

  const target = validateZendeskAttachmentUrl(config, url);
  const response = await fetch(target.url, {
    headers: target.sendAuth
      ? {
          Authorization: buildZendeskAuthHeader(username, token),
        }
      : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(ZENDESK_REQUEST_TIMEOUT_MS),
  });

  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) {
      throw new Error('Zendesk attachment redirect did not include a Location header');
    }
    return fetchZendeskAttachment(
      config,
      new URL(location, target.url).toString(),
      username,
      token,
      redirectCount + 1,
    );
  }

  return response;
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
