import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractZendeskTicketFormId,
  isZendeskTicketEventAllowedForAutomation,
  isZendeskTicketAllowedForSidebar,
} from '../dist/lib/zendesk-ticket-scope.js';

test('extractZendeskTicketFormId: reads Zendesk ticket_form_id', () => {
  assert.equal(extractZendeskTicketFormId({ ticket_form_id: 50882600373907 }), 50882600373907);
  assert.equal(extractZendeskTicketFormId({ ticket_form_id: '50882600373907' }), 50882600373907);
});

test('extractZendeskTicketFormId: tolerates alternate response shapes', () => {
  assert.equal(extractZendeskTicketFormId({ form_id: '42' }), 42);
  assert.equal(extractZendeskTicketFormId({ ticketFormId: '43' }), 43);
  assert.equal(extractZendeskTicketFormId({ ticket_form_id: '' }), null);
  assert.equal(extractZendeskTicketFormId(null), null);
});

test('isZendeskTicketAllowedForSidebar: enforces allowed form IDs', () => {
  assert.equal(
    isZendeskTicketAllowedForSidebar({ ticket_form_id: 50882600373907 }, [50882600373907]),
    true,
  );
  assert.equal(
    isZendeskTicketAllowedForSidebar({ ticket_form_id: 41831496024083 }, [50882600373907]),
    false,
  );
});

test('isZendeskTicketAllowedForSidebar: explicit empty allow-list permits all forms', () => {
  assert.equal(isZendeskTicketAllowedForSidebar({ ticket_form_id: 41831496024083 }, []), true);
});

test('isZendeskTicketEventAllowedForAutomation: skips events outside configured forms without API lookup', async () => {
  const config = {
    zendesk: {
      appAllowedFormIds: [50882600373907],
    },
  };
  const event = {
    detail: {
      id: '39045',
      ticketFormId: 41831496024083,
    },
  };

  assert.equal(await isZendeskTicketEventAllowedForAutomation(config, event), false);
});
