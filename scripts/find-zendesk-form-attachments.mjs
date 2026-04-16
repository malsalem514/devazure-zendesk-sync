/**
 * Lists every ticket form in the tenant and which of the 10 ADO integration
 * fields are attached to each. Read-only — no changes made.
 */

import { createZendeskClient, V1_ADO_FIELD_TITLES } from './lib/zendesk.mjs';

const { client } = createZendeskClient();

const fields = await client.ticketfields.list();
const adoFieldsById = new Map(
  fields.filter((f) => V1_ADO_FIELD_TITLES.includes(f.title)).map((f) => [f.id, f]),
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
