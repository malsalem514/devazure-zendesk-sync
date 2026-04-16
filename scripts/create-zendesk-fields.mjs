/**
 * One-time setup script: creates the 10 v1 ADO integration fields in Zendesk.
 * Idempotent — checks if each field exists by title before creating.
 *
 * Usage:
 *   node --env-file-if-exists=.env scripts/create-zendesk-fields.mjs [--attach-form <formId>]
 *
 * Outputs field IDs for recording in config.
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

const client = createClient({
  username,
  token,
  endpointUri: `${baseUrl}/api/v2`,
});

/** @type {Array<{title: string, key: string, type: string, tag?: string, custom_field_options?: Array<{name: string, value: string}>}>} */
const V1_FIELDS = [
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
