/**
 * Lists every ticket form in the tenant and which of the 10 ADO integration
 * fields are attached to each. Read-only — no changes made.
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

const ADO_FIELD_TITLES = [
  'ADO Work Item ID', 'ADO Work Item URL', 'ADO Status', 'ADO Status Detail',
  'ADO Sprint', 'ADO Sprint Start', 'ADO Sprint End', 'ADO ETA',
  'ADO Sync Health', 'ADO Last Sync At',
];

const client = createClient({ username, token, endpointUri: `${baseUrl}/api/v2` });

const fields = await client.ticketfields.list();
const adoFieldsById = new Map(
  fields.filter((f) => ADO_FIELD_TITLES.includes(f.title)).map((f) => [f.id, f]),
);
console.log(`Found ${adoFieldsById.size} ADO fields in tenant.`);

const formsResult = await client.ticketforms.list();
const forms = Array.isArray(formsResult) ? formsResult : (formsResult?.ticket_forms ?? []);
console.log(`Tenant has ${forms.length} ticket form(s).\n`);

for (const form of forms) {
  const ids = form.ticket_field_ids ?? [];
  const adoAttached = ids.filter((id) => adoFieldsById.has(id));
  console.log(`Form ${form.id} — "${form.name}" (${form.active ? 'active' : 'inactive'}${form.default ? ', default' : ''})`);
  console.log(`  total fields: ${ids.length}`);
  if (adoAttached.length) {
    console.log(`  ADO fields attached (${adoAttached.length}):`);
    for (const fid of adoAttached) {
      const f = adoFieldsById.get(fid);
      console.log(`    - ${fid}  ${f.title}`);
    }
  } else {
    console.log('  ADO fields attached: none');
  }
}
