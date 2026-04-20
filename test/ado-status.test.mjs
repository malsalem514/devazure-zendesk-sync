import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADO_STATUS_TAGS,
  deriveAdoStatus,
  formatStatusDetail,
  computeAdoFingerprint,
} from '../dist/ado-status.js';

test('deriveAdoStatus: completion wins over everything', () => {
  for (const state of ['Resolved', 'Completed', 'Closed', 'Done']) {
    assert.equal(
      deriveAdoStatus({ workItemState: state, hasDatedSprint: true }),
      ADO_STATUS_TAGS.supportReady,
    );
  }
});

test('deriveAdoStatus: active state → Dev In Progress', () => {
  for (const state of ['Active', 'Committed', 'In Development', 'In Testing', 'Waiting on Testing']) {
    assert.equal(
      deriveAdoStatus({ workItemState: state, hasDatedSprint: false }),
      ADO_STATUS_TAGS.devInProgress,
    );
  }
});

test('deriveAdoStatus: dated sprint without active work → Scheduled', () => {
  assert.equal(
    deriveAdoStatus({ workItemState: 'New', hasDatedSprint: true }),
    ADO_STATUS_TAGS.scheduledInSprint,
  );
});

test('deriveAdoStatus: no sprint, no active state → In Dev Backlog', () => {
  assert.equal(
    deriveAdoStatus({ workItemState: 'New', hasDatedSprint: false }),
    ADO_STATUS_TAGS.inDevBacklog,
  );
  assert.equal(
    deriveAdoStatus({ workItemState: null, hasDatedSprint: false }),
    ADO_STATUS_TAGS.inDevBacklog,
  );
});

test('formatStatusDetail: matches docs templates', () => {
  assert.equal(
    formatStatusDetail({
      status: ADO_STATUS_TAGS.devInProgress,
      workItemState: 'In Testing',
      sprintName: 'Sprint 112',
      sprintStart: '2026-04-18T00:00:00Z',
      sprintEnd: '2026-04-24T00:00:00Z',
    }),
    'In testing in Sprint 112 (Apr 18 - Apr 24)',
  );

  assert.equal(
    formatStatusDetail({
      status: ADO_STATUS_TAGS.scheduledInSprint,
      workItemState: 'New',
      sprintName: 'Sprint 112',
      sprintStart: '2026-04-18T00:00:00Z',
      sprintEnd: '2026-04-24T00:00:00Z',
    }),
    'Scheduled in Sprint 112 (Apr 18 - Apr 24)',
  );

  assert.equal(
    formatStatusDetail({
      status: ADO_STATUS_TAGS.inDevBacklog,
      workItemState: 'New',
      sprintName: null,
      sprintStart: null,
      sprintEnd: null,
    }),
    'In backlog',
  );

  assert.equal(
    formatStatusDetail({
      status: ADO_STATUS_TAGS.supportReady,
      workItemState: 'Resolved',
      sprintName: 'Sprint 112',
      sprintStart: '2026-04-18T00:00:00Z',
      sprintEnd: '2026-04-24T00:00:00Z',
    }),
    'Resolved in Sprint 112 (Apr 18 - Apr 24)',
  );

  assert.equal(
    formatStatusDetail({
      status: ADO_STATUS_TAGS.devInProgress,
      workItemState: 'Waiting on Development',
      sprintName: null,
      sprintStart: null,
      sprintEnd: null,
    }),
    'Waiting on development',
  );
});

test('computeAdoFingerprint: stable across key order, changes on content', () => {
  const a = computeAdoFingerprint({
    workItemState: 'Active',
    status: ADO_STATUS_TAGS.devInProgress,
    statusDetail: 'In development',
    sprintName: null,
    sprintStart: null,
    sprintEnd: null,
    eta: null,
    workItemUrl: 'https://example/_workitems/edit/42',
  });
  // Same content — same fingerprint.
  const b = computeAdoFingerprint({
    workItemUrl: 'https://example/_workitems/edit/42',
    eta: null,
    sprintEnd: null,
    sprintStart: null,
    sprintName: null,
    statusDetail: 'In development',
    status: ADO_STATUS_TAGS.devInProgress,
    workItemState: 'Active',
  });
  assert.equal(a, b);

  // Any meaningful change — different fingerprint.
  const c = computeAdoFingerprint({
    workItemState: 'In Testing',
    status: ADO_STATUS_TAGS.devInProgress,
    statusDetail: 'In testing',
    sprintName: null,
    sprintStart: null,
    sprintEnd: null,
    eta: null,
    workItemUrl: 'https://example/_workitems/edit/42',
  });
  assert.notEqual(a, c);
});
