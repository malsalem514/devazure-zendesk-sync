/**
 * One-time setup script: creates the 10 v1 ADO integration fields in Zendesk.
 * Idempotent — checks if each field exists by title before creating.
 *
 * Usage:
 *   node --env-file-if-exists=.env scripts/create-zendesk-fields.mjs [--attach-form <formId>]
 *
 * Outputs field IDs for recording in config.
 */

import { createZendeskClient, V1_FIELDS } from './lib/zendesk.mjs';

const { client } = createZendeskClient();

// Fetch all existing fields to check for duplicates
console.log('Fetching existing ticket fields...');
const existingFields = await client.ticketfields.list();
const existingByTitle = new Map();
for (const f of existingFields) {
  if (f.title) existingByTitle.set(f.title, f);
}

const fieldIdMap = {};
const createdIds = [];

for (const fieldDef of V1_FIELDS) {
  const existing = existingByTitle.get(fieldDef.title);
  if (existing) {
    console.log(`  ✓ "${fieldDef.title}" already exists (id: ${existing.id})`);
    fieldIdMap[fieldDef.key] = existing.id;
    createdIds.push(existing.id);
    continue;
  }

  const payload = {
    ticket_field: {
      title: fieldDef.title,
      type: fieldDef.type,
      ...(fieldDef.tag ? { tag: fieldDef.tag } : {}),
      ...(fieldDef.custom_field_options ? { custom_field_options: fieldDef.custom_field_options } : {}),
    },
  };

  try {
    const result = await client.ticketfields.create(payload);
    const created = result?.result ?? result;
    const id = created?.id ?? created?.ticket_field?.id;
    console.log(`  + Created "${fieldDef.title}" (id: ${id})`);
    fieldIdMap[fieldDef.key] = id;
    createdIds.push(id);
  } catch (err) {
    console.error(`  ✗ Failed to create "${fieldDef.title}":`, err.message ?? err);
  }
}

console.log('\n=== Field ID Map ===');
console.log(JSON.stringify(fieldIdMap, null, 2));

// Optionally attach to a form
const formIdArg = process.argv.indexOf('--attach-form');
if (formIdArg !== -1 && process.argv[formIdArg + 1]) {
  const formId = Number(process.argv[formIdArg + 1]);
  console.log(`\nAttaching fields to form ${formId}...`);
  try {
    const form = await client.ticketforms.show(formId);
    const existing = form?.ticket_form?.ticket_field_ids ?? [];
    const merged = [...new Set([...existing, ...createdIds.filter(Boolean)])];
    await client.ticketforms.update(formId, {
      ticket_form: { ticket_field_ids: merged },
    });
    console.log(`  ✓ Attached ${createdIds.length} fields to form ${formId}`);
  } catch (err) {
    console.error(`  ✗ Failed to attach fields to form:`, err.message ?? err);
  }
}

console.log('\nDone. Save the field ID map above for use in the integration config.');
