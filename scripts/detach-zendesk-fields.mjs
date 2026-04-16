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

import pkg from 'node-zendesk';
const { createClient } = pkg;

const baseUrl = process.env.ZENDESK_BASE_URL?.replace(/\/$/, '');
const username = process.env.ZENDESK_API_USERNAME;
const token = process.env.ZENDESK_API_TOKEN;

if (!baseUrl || !username || !token) {
  console.error('Missing: ZENDESK_BASE_URL, ZENDESK_API_USERNAME, ZENDESK_API_TOKEN');
  process.exit(1);
}

const formArgIdx = process.argv.indexOf('--form');
if (formArgIdx === -1 || !process.argv[formArgIdx + 1]) {
  console.error('Missing --form <formId>');
  process.exit(1);
}
const formId = Number(process.argv[formArgIdx + 1]);

// Canonical list of v1 ADO field titles. Looking up by title keeps this
// decoupled from src/zendesk-field-ids.ts (which embeds tenant-specific IDs).
const ADO_FIELD_TITLES = [
  'ADO Work Item ID',
  'ADO Work Item URL',
  'ADO Status',
  'ADO Status Detail',
  'ADO Sprint',
  'ADO Sprint Start',
  'ADO Sprint End',
  'ADO ETA',
  'ADO Sync Health',
  'ADO Last Sync At',
];

const client = createClient({ username, token, endpointUri: `${baseUrl}/api/v2` });

console.log('Fetching ticket fields…');
const fields = await client.ticketfields.list();
const adoFieldIds = new Set(
  fields.filter((f) => ADO_FIELD_TITLES.includes(f.title)).map((f) => f.id),
);
console.log(`  Found ${adoFieldIds.size} ADO integration fields by title.`);

console.log(`Fetching form ${formId}…`);
const formResp = await client.ticketforms.show(formId);
// node-zendesk v6 wraps responses as { response, result }. Older shapes nested
// the form under .ticket_form or returned it at the top level — handle all three.
const form = formResp?.result ?? formResp?.ticket_form ?? formResp;
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
