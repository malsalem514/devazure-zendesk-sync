/**
 * Clone a Zendesk ticket form, optionally appending the ADO integration fields
 * and/or restricting it to agents only.
 *
 * Usage:
 *   node --env-file-if-exists=.env scripts/clone-zendesk-form.mjs \
 *     --source <formId> --name "<new name>" [--display-name "<shown to agents>"] \
 *     [--agents-only] [--attach-ado]
 *
 * Example (ADO integration sandbox):
 *   node --env-file-if-exists=.env scripts/clone-zendesk-form.mjs \
 *     --source 41831496024083 \
 *     --name "ADO Integration Sandbox" \
 *     --agents-only --attach-ado
 */

import pkg from 'node-zendesk';
const { createClient } = pkg;

const baseUrl = process.env.ZENDESK_BASE_URL?.replace(/\/$/, '');
const username = process.env.ZENDESK_API_USERNAME;
const token = process.env.ZENDESK_API_TOKEN;

if (!baseUrl || !username || !token) {
  console.error('Missing: ZENDESK_BASE_URL, ZENDESK_API_USERNAME, ZENDESK_API_TOKEN');
  process.exit(1);
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}
function flag(name) {
  return process.argv.includes(name);
}

const sourceId = Number(arg('--source'));
const name = arg('--name');
const displayName = arg('--display-name') ?? name;
const agentsOnly = flag('--agents-only');
const attachAdo = flag('--attach-ado');

if (!sourceId || !name) {
  console.error('Missing required: --source <formId> --name "<new name>"');
  process.exit(1);
}

const ADO_FIELD_TITLES = [
  'ADO Work Item ID', 'ADO Work Item URL', 'ADO Status', 'ADO Status Detail',
  'ADO Sprint', 'ADO Sprint Start', 'ADO Sprint End', 'ADO ETA',
  'ADO Sync Health', 'ADO Last Sync At',
];

const client = createClient({ username, token, endpointUri: `${baseUrl}/api/v2` });

function unwrap(resp) {
  return resp?.result ?? resp?.ticket_form ?? resp;
}

console.log(`Fetching source form ${sourceId}…`);
const source = unwrap(await client.ticketforms.show(sourceId));
const sourceFieldIds = source?.ticket_field_ids ?? [];
console.log(`  "${source.name}" — ${sourceFieldIds.length} fields`);

let fieldIds = [...sourceFieldIds];

if (attachAdo) {
  console.log('Resolving ADO field IDs by title…');
  const allFields = await client.ticketfields.list();
  const adoIds = allFields
    .filter((f) => ADO_FIELD_TITLES.includes(f.title))
    .map((f) => f.id);
  if (adoIds.length !== ADO_FIELD_TITLES.length) {
    console.warn(`  Warning: expected ${ADO_FIELD_TITLES.length} ADO fields, found ${adoIds.length}`);
  }
  fieldIds = [...new Set([...fieldIds, ...adoIds])];
  console.log(`  Will attach ${adoIds.length} ADO field(s); total on new form: ${fieldIds.length}`);
}

const payload = {
  ticket_form: {
    name,
    display_name: displayName,
    active: true,
    end_user_visible: !agentsOnly,
    ticket_field_ids: fieldIds,
    position: (source.position ?? 0) + 100,
  },
};

console.log(`Creating form "${name}" (end_user_visible=${payload.ticket_form.end_user_visible})…`);
const created = unwrap(await client.ticketforms.create(payload));
console.log(`✓ Created form ${created.id} — "${created.name}"`);
console.log(`  URL: ${baseUrl}/admin/objects-rules/tickets/ticket-forms/edit/${created.id}`);
