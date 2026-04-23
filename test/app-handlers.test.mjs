import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummaryFromSnapshot } from '../dist/app-handlers.js';

const ORG_URL = 'https://dev.azure.com/jestaisinc';

test('buildSummaryFromSnapshot: returns linked=false when no link row', () => {
  const result = buildSummaryFromSnapshot(12345, null, null, ORG_URL);
  assert.deepEqual(result, { ok: true, ticketId: 12345, linked: false });
});

test('buildSummaryFromSnapshot: assembles view model from link + Zendesk fields', () => {
  const link = {
    ADO_ORG: 'jestaisinc',
    ADO_PROJECT: 'VisionSuite',
    ADO_WORK_ITEM_ID: 79741,
    LAST_SYNCED_AT: new Date('2026-04-20T15:22:11.000Z'),
    LAST_SYNC_SOURCE: 'ado',
  };
  const snapshot = {
    id: 39045,
    subject: 'Test',
    customFields: {
      50877235285395: 'https://dev.azure.com/jestaisinc/VisionSuite/_workitems/edit/79741',
      50877228156563: 'ado_status_in_dev_backlog',
      50877235562259: 'In backlog',
      50877208001043: 'Sprint 42',
      50877235803539: '2026-05-01T00:00:00.000Z',
      50877218501395: 'ado_sync_health_ok',
      50877208248211: '2026-04-20T15:22:11.000Z',
    },
  };

  const result = buildSummaryFromSnapshot(39045, link, snapshot, ORG_URL);
  assert.equal(result.ok, true);
  assert.equal(result.linked, true);
  assert.equal(result.workItem?.id, 79741);
  assert.equal(result.workItem?.url, 'https://dev.azure.com/jestaisinc/VisionSuite/_workitems/edit/79741');
  assert.equal(result.workItem?.status, 'In backlog');
  assert.equal(result.workItem?.statusDetail, 'In backlog');
  assert.equal(result.workItem?.sprint, 'Sprint 42');
  assert.equal(result.workItem?.eta, '2026-05-01T00:00:00.000Z');
  assert.equal(result.workItem?.syncHealth, 'ado_sync_health_ok');
  assert.equal(result.workItem?.lastSyncAt, '2026-04-20T15:22:11.000Z');
});

test('buildSummaryFromSnapshot: prefers live ADO projection over legacy Zendesk mirror fields', () => {
  const link = {
    ADO_ORG: 'jestaisinc',
    ADO_PROJECT: 'VisionSuite',
    ADO_WORK_ITEM_ID: 79741,
    LAST_SYNCED_AT: new Date('2026-04-20T15:22:11.000Z'),
    LAST_SYNC_SOURCE: 'ado',
  };
  const snapshot = {
    id: 39045,
    subject: 'Test',
    customFields: {
      50877228156563: 'ado_status_in_dev_backlog',
      50877235562259: 'Stale backlog value',
      50877208001043: 'Stale sprint',
      50877235803539: '2026-05-01T00:00:00.000Z',
    },
  };
  const projection = {
    status: 'Dev In Progress',
    statusDetail: 'In development in Sprint 43',
    statusTag: 'ado_status_dev_in_progress',
    sprint: 'Sprint 43',
    sprintStart: '2026-05-04T00:00:00.000Z',
    sprintEnd: '2026-05-15T00:00:00.000Z',
    eta: '2026-05-15T00:00:00.000Z',
    syncHealth: 'ado_sync_health_ok',
  };

  const result = buildSummaryFromSnapshot(39045, link, snapshot, ORG_URL, null, projection);
  assert.equal(result.workItem?.status, 'Dev In Progress');
  assert.equal(result.workItem?.statusDetail, 'In development in Sprint 43');
  assert.equal(result.workItem?.statusTag, 'ado_status_dev_in_progress');
  assert.equal(result.workItem?.sprint, 'Sprint 43');
  assert.equal(result.workItem?.eta, '2026-05-15T00:00:00.000Z');
});

test('buildSummaryFromSnapshot: enriches sidebar model with ADO work item fields', () => {
  const link = {
    ADO_ORG: 'jestaisinc',
    ADO_PROJECT: 'VisionSuite',
    ADO_WORK_ITEM_ID: 79741,
    LAST_SYNCED_AT: new Date('2026-04-20T15:22:11.000Z'),
    LAST_SYNC_SOURCE: 'zendesk',
  };
  const zendeskSnapshot = {
    id: 39045,
    subject: 'Test',
    customFields: {
      50877235562259: 'Scheduled for Sprint 42',
      50877208001043: 'Sprint 42',
      50877235803539: '2026-05-01T00:00:00.000Z',
    },
  };
  const adoSnapshot = {
    id: '79741',
    rev: 5,
    url: 'https://dev.azure.com/jestaisinc/VisionSuite/_apis/wit/workItems/79741',
    workItemType: 'Bug',
    reason: 'Investigating',
    state: 'Active',
    areaPath: 'VisionSuite\\Area\\Support',
    iterationPath: 'VisionSuite\\Sprint 42',
    title: '[Zendesk #39045] Test',
    assignedTo: 'Sam Engineer',
    priority: 1,
    severity: '2 - High',
    createdAt: '2026-04-17T16:21:54.000Z',
    changedAt: '2026-04-20T15:22:11.000Z',
    product: 'Core-Customer Service Portal',
    client: 'Acme',
    crf: 'CRF-001',
    bucket: 'Support',
    unplanned: true,
    tags: ['zendesk', 'zendesk:id:39045'],
    fields: {},
  };

  const result = buildSummaryFromSnapshot(39045, link, zendeskSnapshot, ORG_URL, adoSnapshot);
  assert.equal(result.workItem?.title, '[Zendesk #39045] Test');
  assert.equal(result.workItem?.workItemType, 'Bug');
  assert.equal(result.workItem?.state, 'Active');
  assert.equal(result.workItem?.reason, 'Investigating');
  assert.equal(result.workItem?.assignedTo, 'Sam Engineer');
  assert.equal(result.workItem?.priority, 1);
  assert.equal(result.workItem?.severity, '2 - High');
  assert.equal(result.workItem?.lastSyncSource, 'zendesk');
  assert.match(result.workItem?.customerUpdate ?? '', /Owner: Sam Engineer/);
});

test('buildSummaryFromSnapshot: synthesizes URL when Zendesk has no URL field', () => {
  const link = {
    ADO_ORG: 'jestaisinc',
    ADO_PROJECT: 'Vision Analytics',
    ADO_WORK_ITEM_ID: 42,
    LAST_SYNCED_AT: null,
    LAST_SYNC_SOURCE: null,
  };
  const result = buildSummaryFromSnapshot(1, link, null, ORG_URL);
  assert.equal(result.workItem?.url, 'https://dev.azure.com/jestaisinc/Vision%20Analytics/_workitems/edit/42');
});

test('buildSummaryFromSnapshot: falls back to link.LAST_SYNCED_AT when field is empty', () => {
  const link = {
    ADO_ORG: 'jestaisinc',
    ADO_PROJECT: 'VisionSuite',
    ADO_WORK_ITEM_ID: 1,
    LAST_SYNCED_AT: new Date('2026-04-20T10:00:00.000Z'),
    LAST_SYNC_SOURCE: 'zendesk',
  };
  const snapshot = { id: 1, subject: null, customFields: {} };
  const result = buildSummaryFromSnapshot(1, link, snapshot, ORG_URL);
  assert.equal(result.workItem?.lastSyncAt, '2026-04-20T10:00:00.000Z');
});

test('buildSummaryFromSnapshot: uses newest sync timestamp when link is newer than Zendesk field', () => {
  const link = {
    ADO_ORG: 'jestaisinc',
    ADO_PROJECT: 'VisionSuite',
    ADO_WORK_ITEM_ID: 1,
    LAST_SYNCED_AT: new Date('2026-04-21T10:00:00.000Z'),
    LAST_SYNC_SOURCE: 'zendesk',
  };
  const snapshot = {
    id: 1,
    subject: null,
    customFields: {
      50877208248211: '2026-04-20T10:00:00.000Z',
    },
  };
  const result = buildSummaryFromSnapshot(1, link, snapshot, ORG_URL);
  assert.equal(result.workItem?.lastSyncAt, '2026-04-21T10:00:00.000Z');
});

test('buildSummaryFromSnapshot: tolerates trims empty/whitespace field values to null', () => {
  const link = {
    ADO_ORG: 'jestaisinc',
    ADO_PROJECT: 'VisionSuite',
    ADO_WORK_ITEM_ID: 1,
    LAST_SYNCED_AT: null,
    LAST_SYNC_SOURCE: null,
  };
  const snapshot = {
    id: 1, subject: null,
    customFields: {
      50877228156563: '',
      50877235562259: '   ',
      50877208001043: null,
    },
  };
  const result = buildSummaryFromSnapshot(1, link, snapshot, ORG_URL);
  assert.equal(result.workItem?.status, null);
  assert.equal(result.workItem?.statusDetail, null);
  assert.equal(result.workItem?.sprint, null);
});

import { parseWorkItemReference, ticketToEvent, AppActionError } from '../dist/app-handlers.js';
import { unwrapZendeskTicketResponse } from '../dist/lib/zendesk-api.js';

test('unwrapZendeskTicketResponse: unwraps node-zendesk v6 response shape', () => {
  const ticket = { id: 123, subject: 'Wrapped ticket', custom_fields: [] };
  assert.deepEqual(
    unwrapZendeskTicketResponse({ response: { statusCode: 200 }, result: { ticket } }),
    ticket,
  );
});

test('unwrapZendeskTicketResponse: accepts legacy and direct ticket shapes', () => {
  const ticket = { id: 456, subject: 'Legacy ticket', custom_fields: [] };
  assert.deepEqual(unwrapZendeskTicketResponse({ ticket }), ticket);
  assert.deepEqual(unwrapZendeskTicketResponse(ticket), ticket);
  assert.equal(unwrapZendeskTicketResponse(null), null);
});

test('parseWorkItemReference: numeric id', () => {
  assert.equal(parseWorkItemReference('79741'), 79741);
  assert.equal(parseWorkItemReference('  42  '), 42);
});

test('parseWorkItemReference: ADO URL', () => {
  assert.equal(
    parseWorkItemReference('https://dev.azure.com/jestaisinc/VisionSuite/_workitems/edit/79741'),
    79741,
  );
});

test('parseWorkItemReference: URL with query string and fragment', () => {
  assert.equal(
    parseWorkItemReference('https://dev.azure.com/org/proj/_workitems/edit/123?foo=bar#tab'),
    123,
  );
});

test('parseWorkItemReference: rejects garbage', () => {
  assert.throws(() => parseWorkItemReference('not-a-work-item'), AppActionError);
  assert.throws(() => parseWorkItemReference('https://example.com/other/path'), AppActionError);
  assert.throws(() => parseWorkItemReference(''), AppActionError);
});

test('ticketToEvent: reads routing fields from custom_fields by id', () => {
  const ticket = {
    id: 39045,
    subject: 'Test ticket',
    description: 'body',
    status: 'open',
    priority: 'high',
    type: 'incident',
    tags: ['ado_sync_pilot', 'other'],
    requester_id: 12345,
    assignee_id: 67890,
    organization_id: null,
    group_id: 1,
    brand_id: 2,
    via: { channel: 'email' },
    updated_at: '2026-04-20T15:00:00Z',
    created_at: '2026-04-20T14:00:00Z',
    custom_fields: [
      { id: 40815528446739, value: 'omni' },
      { id: 40990804522131, value: 'defect' },
      { id: 40992814161939, value: 'CRF-123' },
      { id: 99999999, value: 'unrelated' },
    ],
  };
  const event = ticketToEvent(ticket, 'sidebar_create');
  assert.equal(event.detail.id, '39045');
  assert.equal(event.detail.product, 'omni');
  assert.equal(event.detail.caseType, 'defect');
  assert.equal(event.detail.crf, 'CRF-123');
  assert.equal(event.detail.orgName, null);
  assert.equal(event.detail.viaChannel, 'email');
  assert.equal(event.detail.subject, 'Test ticket');
  assert.deepEqual(event.detail.tags, ['ado_sync_pilot', 'other']);
  assert.equal(event.detail.requesterId, '12345');
  assert.match(event.id, /^sidebar_create:39045:\d+$/);
  assert.equal(event.type, 'zen:event-type:ticket.created');
});

test('ticketToEvent: uses sidebar_link prefix and type when source is link', () => {
  const event = ticketToEvent({ id: 1, custom_fields: [] }, 'sidebar_link');
  assert.match(event.id, /^sidebar_link:1:\d+$/);
  assert.equal(event.type, 'zen:event-type:ticket.linked');
});

test('ticketToEvent: tolerates missing optional fields', () => {
  const event = ticketToEvent({ id: 42, custom_fields: [] }, 'sidebar_create');
  assert.equal(event.detail.subject, null);
  assert.equal(event.detail.product, null);
  assert.equal(event.detail.caseType, null);
  assert.equal(event.detail.viaChannel, null);
  assert.deepEqual(event.detail.tags, []);
});

test('ticketToEvent: throws on missing numeric id', () => {
  assert.throws(() => ticketToEvent({ custom_fields: [] }, 'sidebar_create'), AppActionError);
  assert.throws(() => ticketToEvent({ id: 'abc', custom_fields: [] }, 'sidebar_create'), AppActionError);
});
