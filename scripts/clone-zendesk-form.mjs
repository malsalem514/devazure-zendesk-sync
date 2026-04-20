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

import {
  createZendeskClient,
  V1_ADO_FIELD_TITLES,
  unwrapTicketForm,
} from './lib/zendesk.mjs';

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

const { client, baseUrl } = createZendeskClient();

console.log(`Fetching source form ${sourceId}…`);
const source = unwrapTicketForm(await client.ticketforms.show(sourceId));
const sourceFieldIds = source?.ticket_field_ids ?? [];
console.log(`  "${source.name}" — ${sourceFieldIds.length} fields`);

let fieldIds = [...sourceFieldIds];

if (attachAdo) {
  console.log('Resolving ADO field IDs by title…');
  const allFields = await client.ticketfields.list();
  const adoIds = allFields
    .filter((f) => V1_ADO_FIELD_TITLES.includes(f.title))
    .map((f) => f.id);
  if (adoIds.length !== V1_ADO_FIELD_TITLES.length) {
    console.warn(`  Warning: expected ${V1_ADO_FIELD_TITLES.length} ADO fields, found ${adoIds.length}`);
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
    // Push the clone below the source in the admin form-ordering UI. +100
    // leaves room for a handful of further clones before colliding with
    // adjacent forms' positions; admins can reorder freely afterward.
    position: (source.position ?? 0) + 100,
  },
};

console.log(`Creating form "${name}" (end_user_visible=${payload.ticket_form.end_user_visible})…`);
const created = unwrapTicketForm(await client.ticketforms.create(payload));
console.log(`✓ Created form ${created.id} — "${created.name}"`);
console.log(`  URL: ${baseUrl}/admin/objects-rules/tickets/ticket-forms/edit/${created.id}`);
