/**
 * Shared helpers for the .mjs admin scripts that talk to the Zendesk API.
 *
 * Kept as a sibling .mjs (not an import from the compiled dist/) so the
 * scripts stay runnable before `npm run build`.
 */

import pkg from 'node-zendesk';
const { createClient } = pkg;

/**
 * Canonical definitions of the 10 ADO integration ticket fields. Source of
 * truth for field titles, option sets, and tagger values. `create-zendesk-
 * fields.mjs` uses the full shape; the form-manipulation scripts only need
 * the titles (see V1_ADO_FIELD_TITLES).
 *
 * @type {Array<{title: string, key: string, type: string, tag?: string, custom_field_options?: Array<{name: string, value: string}>}>}
 */
export const V1_FIELDS = [
  { title: 'ADO Work Item ID', key: 'ado_work_item_id', type: 'integer' },
  { title: 'ADO Work Item URL', key: 'ado_work_item_url', type: 'text' },
  {
    title: 'ADO Status',
    key: 'ado_status',
    type: 'tagger',
    tag: 'ado_status',
    custom_field_options: [
      { name: 'In Dev Backlog', value: 'ado_status_in_dev_backlog' },
      { name: 'Scheduled In Sprint', value: 'ado_status_scheduled_in_sprint' },
      { name: 'Dev In Progress', value: 'ado_status_dev_in_progress' },
      { name: 'Support Ready', value: 'ado_status_support_ready' },
    ],
  },
  { title: 'ADO Status Detail', key: 'ado_status_detail', type: 'text' },
  { title: 'ADO Sprint', key: 'ado_sprint', type: 'text' },
  { title: 'ADO Sprint Start', key: 'ado_sprint_start', type: 'date' },
  { title: 'ADO Sprint End', key: 'ado_sprint_end', type: 'date' },
  { title: 'ADO ETA', key: 'ado_eta', type: 'date' },
  {
    title: 'ADO Sync Health',
    key: 'ado_sync_health',
    type: 'tagger',
    tag: 'ado_sync_health',
    custom_field_options: [
      { name: 'OK', value: 'ado_sync_health_ok' },
      { name: 'Warning', value: 'ado_sync_health_warning' },
      { name: 'Error', value: 'ado_sync_health_error' },
    ],
  },
  { title: 'ADO Last Sync At', key: 'ado_last_sync_at', type: 'text' },
];

export const V1_ADO_FIELD_TITLES = V1_FIELDS.map((f) => f.title);

/**
 * Build a node-zendesk client from the standard env vars.
 * Exits the process with a clear message if any are missing.
 *
 * @returns {{ client: ReturnType<typeof createClient>, baseUrl: string }}
 */
export function createZendeskClient() {
  const baseUrl = process.env.ZENDESK_BASE_URL?.replace(/\/$/, '');
  const username = process.env.ZENDESK_API_USERNAME;
  const token = process.env.ZENDESK_API_TOKEN;

  if (!baseUrl || !username || !token) {
    console.error('Missing: ZENDESK_BASE_URL, ZENDESK_API_USERNAME, ZENDESK_API_TOKEN');
    process.exit(1);
  }

  const client = createClient({
    username,
    token,
    endpointUri: `${baseUrl}/api/v2`,
  });

  return { client, baseUrl };
}

/**
 * Unwrap a node-zendesk ticketforms response.
 *
 * v6 wraps responses as `{ response, result }`; older shapes nested the form
 * under `.ticket_form` or returned it at the top level. Accepting all three
 * lets this library work across upgrades without conditional call sites.
 */
export function unwrapTicketForm(resp) {
  return resp?.result ?? resp?.ticket_form ?? resp;
}
