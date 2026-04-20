import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAdoEvent } from '../dist/ado-event-parser.js';

test('parseAdoEvent: workitem.updated extracts workItemId from resource.workItemId', () => {
  const body = JSON.stringify({
    id: 'evt-1',
    eventType: 'workitem.updated',
    createdDate: '2026-04-16T10:00:00Z',
    resource: {
      id: 999, // revision row id — NOT the work item id
      workItemId: 1234,
      rev: 5,
      fields: { 'System.State': { oldValue: 'New', newValue: 'Active' } },
    },
    resourceContainers: { project: { id: 'proj-uuid' } },
  });

  const event = parseAdoEvent(body);
  assert.equal(event.id, 'evt-1');
  assert.equal(event.eventType, 'workitem.updated');
  assert.equal(event.workItemId, 1234);
  assert.equal(event.revision, 5);
  assert.equal(event.projectId, 'proj-uuid');
});

test('parseAdoEvent: workitem.created falls back to resource.id', () => {
  const body = JSON.stringify({
    id: 'evt-2',
    eventType: 'workitem.created',
    resource: { id: 4321, rev: 1 },
  });
  const event = parseAdoEvent(body);
  assert.equal(event.workItemId, 4321);
  assert.equal(event.revision, 1);
});

test('parseAdoEvent: rejects non-workitem events', () => {
  const body = JSON.stringify({ id: 'e', eventType: 'build.complete', resource: { id: 1 } });
  assert.throws(() => parseAdoEvent(body), /unsupported eventType/);
});

test('parseAdoEvent: rejects payload missing id', () => {
  const body = JSON.stringify({ eventType: 'workitem.updated', resource: { workItemId: 1 } });
  assert.throws(() => parseAdoEvent(body), /missing id/);
});

test('parseAdoEvent: rejects malformed JSON', () => {
  assert.throws(() => parseAdoEvent('{not json'), /invalid JSON/);
});
