import test from 'node:test';
import assert from 'node:assert/strict';
import { ADO_STATUS_TAGS } from '../dist/ado-status.js';
import { zendeskCustomStatusForAdoStatusForTicket } from '../dist/job-handlers.js';

test('zendeskCustomStatusForAdoStatusForTicket preserves terminal Zendesk statuses', () => {
  const config = {
    zendesk: {
      adoStatusCustomStatusMap: {
        [ADO_STATUS_TAGS.supportReady]: 43270434394131,
      },
    },
  };

  assert.equal(
    zendeskCustomStatusForAdoStatusForTicket(
      config,
      ADO_STATUS_TAGS.supportReady,
      { status: 'open', custom_status_id: 51457546974739 },
    ),
    43270434394131,
  );
  assert.equal(
    zendeskCustomStatusForAdoStatusForTicket(
      config,
      ADO_STATUS_TAGS.supportReady,
      { status: 'solved', custom_status_id: 39707455786771 },
    ),
    undefined,
  );
});
