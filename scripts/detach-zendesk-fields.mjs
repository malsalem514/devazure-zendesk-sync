/**
 * Remove the 10 ADO integration fields from a Zendesk form's `ticket_field_ids`.
 *
 * The fields are NOT deleted or deactivated — they stay usable via the API
 * (so the integration keeps reading/writing them) and can be re-attached
 * later with `create-zendesk-fields.mjs --attach-form <id>`.
 *
 * Usage:
 *   node --env-file-if-exists=.env scripts/detach-zendesk-fields.mjs --form <formId>
 *
 * Example:
 *   node --env-file-if-exists=.env scripts/detach-zendesk-fields.mjs --form 49194441682579
 */

import { createZendeskClient, V1_ADO_FIELD_TITLES, unwrapTicketForm } from './lib/zendesk.mjs';

const formArgIdx = process.argv.indexOf('--form');
if (formArgIdx === -1 || !process.argv[formArgIdx + 1]) {
  console.error('Missing --form <formId>');
  process.exit(1);
}
const formId = Number(process.argv[formArgIdx + 1]);

const { client } = createZendeskClient();

console.log('Fetching ticket fields…');
const fields = await client.ticketfields.list();
const adoFieldIds = new Set(
  fields.filter((f) => V1_ADO_FIELD_TITLES.includes(f.title)).map((f) => f.id),
);
console.log(`  Found ${adoFieldIds.size} ADO integration fields by title.`);

console.log(`Fetching form ${formId}…`);
const form = unwrapTicketForm(await client.ticketforms.show(formId));
const current = form?.ticket_field_ids ?? [];
console.log(`  Form has ${current.length} fields currently.`);

const filtered = current.filter((id) => !adoFieldIds.has(id));
const removed = current.length - filtered.length;

if (removed === 0) {
  console.log('  No ADO fields on the form — nothing to do.');
  process.exit(0);
}

console.log(`  Removing ${removed} field(s) from the form…`);
await client.ticketforms.update(formId, {
  ticket_form: { ticket_field_ids: filtered },
});

console.log(`✓ Detached ${removed} ADO field(s) from form ${formId}.`);
console.log('  (Fields themselves are untouched. Re-attach anytime with');
console.log('   `create-zendesk-fields.mjs --attach-form <formId>`.)');
