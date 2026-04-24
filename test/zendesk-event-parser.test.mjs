import test from 'node:test';
import assert from 'node:assert/strict';
import { parseZendeskTicketEvent } from '../dist/zendesk-event-parser.js';

test('parseZendeskTicketEvent: captures comment visibility, attachments, and XREF', () => {
  const event = parseZendeskTicketEvent(JSON.stringify({
    id: 'evt-attachment',
    type: 'zen:event-type:ticket.comment_added',
    subject: 'zen:ticket:39045',
    time: '2026-04-24T00:00:00.000Z',
    zendesk_event_version: '2022-11-06',
      detail: {
        id: 39045,
        ticket_form_id: 50882600373907,
        subject: 'Attachment ticket',
        description: 'Issue detail',
      tags: ['dev_escalation'],
      xref: 'SCOPUS-123',
    },
    event: {
      comment: {
        id: 5100,
        body: 'Customer screenshot attached',
        public: true,
        attachments: [
          {
            id: 9001,
            file_name: 'screen.png',
            content_url: 'https://example.zendesk.com/attachments/screen.png',
            content_type: 'image/png',
            size: 12345,
          },
        ],
      },
    },
  }));

  assert.equal(event.commentId, '5100');
  assert.equal(event.commentPublic, true);
  assert.equal(event.detail.ticketFormId, 50882600373907);
  assert.equal(event.detail.xref, 'SCOPUS-123');
  assert.deepEqual(event.commentAttachments, [{
    id: '9001',
    fileName: 'screen.png',
    contentUrl: 'https://example.zendesk.com/attachments/screen.png',
    contentType: 'image/png',
    size: 12345,
  }]);
});
