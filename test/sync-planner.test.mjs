import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSyncPlan, shouldSyncZendeskCommentToAdo } from '../dist/sync-planner.js';

const baseConfig = {
  port: 8787,
  webhookPath: '/webhooks/zendesk',
  dryRun: true,
  zendesk: {
    webhookSecret: 'secret',
    baseUrl: 'https://example.zendesk.com',
    skipSignatureVerification: false,
  },
  devAzure: {
    orgUrl: 'https://dev.azure.com/example',
    project: 'Support',
    pat: 'secret',
    workItemType: 'Bug',
    apiVersion: '7.1',
  },
  oracle: {
    user: 'test',
    password: 'test',
    connectString: 'localhost/TEST',
    poolMin: 1,
    poolMax: 2,
  },
};

test('buildSyncPlan creates a create plan for a normal ticket event', () => {
  const event = {
    id: 'evt-1',
    type: 'zen:event-type:ticket.comment_added',
    subject: 'zen:ticket:74184',
    time: '2025-01-08T07:32:05.554213813Z',
    zendeskEventVersion: '2022-11-06',
    detail: {
      id: '74184',
      subject: 'Event Log Smoke Ticket',
      description: 'Initial comment',
      status: 'OPEN',
      priority: 'high',
      type: null,
      tags: ['integration', 'vip_customer'],
      updatedAt: '2025-01-08T07:32:05Z',
      createdAt: '2025-01-08T07:31:03Z',
      requesterId: '6832979613182',
      assigneeId: '6832979613182',
      organizationId: '6832979622654',
      groupId: '6832953668990',
      brandId: '6832963029118',
      viaChannel: 'web_service',
      product: 'Financials',
      orgName: 'Stokes',
      caseType: 'Defect',
      crf: 'CRF-001',
    },
    commentId: '8645910207102',
    commentBody: 'Latest customer-visible comment',
  };

  const plan = buildSyncPlan(event, baseConfig, null);

  assert.equal(plan.action, 'create');
  assert.equal(plan.ticketId, '74184');
  assert.match(plan.title, /Zendesk #74184/);
  assert.ok(plan.tags.includes('zendesk:id:74184'));
  assert.ok(
    plan.operations.some((operation) => operation.path === '/fields/System.Title'),
  );
  assert.ok(
    plan.operations.some((operation) => operation.path === '/relations/-'),
  );
  // V1 required fields
  assert.ok(
    plan.operations.some((op) => op.path === '/fields/Custom.Bucket' && op.value === 'Support'),
  );
  assert.ok(
    plan.operations.some((op) => op.path === '/fields/Custom.Unplanned' && op.value === true),
  );
  assert.ok(
    plan.operations.some((op) => op.path === '/fields/Microsoft.VSTS.Common.ValueArea'),
  );
  // Routing: Financials -> Vision Financials area path
  assert.ok(
    plan.operations.some((op) => op.path === '/fields/System.AreaPath' && op.value?.includes('Financials')),
  );
  // Field mapping
  assert.ok(
    plan.operations.some((op) => op.path === '/fields/Custom.Client' && op.value === 'Stokes'),
  );
  assert.ok(
    plan.operations.some((op) => op.path === '/fields/Custom.CRF' && op.value === 'CRF-001'),
  );
  // Case Type -> work item type
  assert.equal(plan.workItemType, 'Bug');
});

test('buildSyncPlan keeps unmapped Zendesk org names out of ADO client picklist writes', () => {
  const event = {
    id: 'evt-1b',
    type: 'zen:event-type:ticket.comment_added',
    subject: 'zen:ticket:74185',
    time: '2025-01-08T07:32:05.554213813Z',
    zendeskEventVersion: '2022-11-06',
    detail: {
      id: '74185',
      subject: 'Unmapped client ticket',
      description: 'Initial comment',
      status: 'OPEN',
      priority: 'normal',
      type: null,
      tags: [],
      updatedAt: '2025-01-08T07:32:05Z',
      createdAt: '2025-01-08T07:31:03Z',
      requesterId: '6832979613182',
      assigneeId: null,
      organizationId: '6832979622654',
      groupId: '6832953668990',
      brandId: '6832963029118',
      viaChannel: 'web_service',
      product: 'Financials',
      orgName: 'Acme Corp',
      caseType: 'Defect',
      crf: null,
    },
    commentId: null,
    commentBody: null,
  };

  const plan = buildSyncPlan(event, baseConfig, null);

  assert.ok(
    !plan.operations.some((op) => op.path === '/fields/Custom.Client'),
  );
  assert.ok(
    plan.operations.some((op) => op.path === '/fields/System.Description' && op.value.includes('Acme Corp')),
  );
});

test('buildSyncPlan returns noop for destructive events', () => {
  const event = {
    id: 'evt-2',
    type: 'zen:event-type:ticket.soft_deleted',
    subject: 'zen:ticket:75418',
    time: '2025-01-15T02:50:15.906323869Z',
    zendeskEventVersion: '2022-11-06',
    detail: {
      id: '75418',
      subject: 'Deleted ticket',
      description: 'No longer relevant',
      status: 'DELETED',
      priority: null,
      type: null,
      tags: [],
      updatedAt: '2025-01-15T02:50:15Z',
      createdAt: '2025-01-15T02:50:15Z',
      requesterId: null,
      assigneeId: null,
      organizationId: null,
      groupId: null,
      brandId: null,
      viaChannel: 'web_service',
      product: null,
      orgName: null,
      caseType: null,
      crf: null,
    },
    commentId: null,
    commentBody: null,
  };

  const plan = buildSyncPlan(event, baseConfig, null);

  assert.equal(plan.action, 'noop');
  assert.match(plan.reason, /Ignoring destructive Zendesk event/);
  assert.equal(plan.operations.length, 0);
});

test('buildSyncPlan returns noop for integration-authored private notes', () => {
  const event = {
    id: 'evt-3',
    type: 'zen:event-type:ticket.comment_added',
    subject: 'zen:ticket:75418',
    time: '2025-01-15T02:50:15.906323869Z',
    zendeskEventVersion: '2022-11-06',
    detail: {
      id: '75418',
      subject: 'Integration note',
      description: 'No customer change',
      status: 'OPEN',
      priority: null,
      type: null,
      tags: [],
      updatedAt: '2025-01-15T02:50:15Z',
      createdAt: '2025-01-15T02:50:15Z',
      requesterId: null,
      assigneeId: null,
      organizationId: null,
      groupId: null,
      brandId: null,
      viaChannel: 'web_service',
      product: null,
      orgName: null,
      caseType: null,
      crf: null,
    },
    commentId: '123',
    commentBody: '[Synced by sidebar] Unlinked Azure DevOps work item #79741 from this Zendesk ticket.',
  };

  const plan = buildSyncPlan(event, baseConfig, null);

  assert.equal(plan.action, 'noop');
  assert.match(plan.reason, /integration-authored/);
  assert.equal(plan.operations.length, 0);
});

test('shouldSyncZendeskCommentToAdo follows public reply and #sync rules', () => {
  const baseEvent = {
    id: 'evt-comment',
    type: 'zen:event-type:ticket.comment_added',
    subject: 'zen:ticket:75418',
    time: '2025-01-15T02:50:15.906323869Z',
    zendeskEventVersion: '2022-11-06',
    detail: {
      id: '75418',
      subject: 'Comment rules',
      description: null,
      status: 'OPEN',
      priority: null,
      type: null,
      tags: [],
      updatedAt: null,
      createdAt: null,
      requesterId: null,
      assigneeId: null,
      organizationId: null,
      groupId: null,
      brandId: null,
      viaChannel: null,
      product: null,
      orgName: null,
      caseType: null,
      crf: null,
      xref: null,
    },
    commentId: '123',
    commentAttachments: [],
  };

  assert.equal(shouldSyncZendeskCommentToAdo({
    ...baseEvent,
    commentBody: 'Public customer update',
    commentPublic: true,
  }), true);
  assert.equal(shouldSyncZendeskCommentToAdo({
    ...baseEvent,
    commentBody: null,
    commentPublic: true,
    commentAttachments: [{
      id: 'att-1',
      fileName: 'screen.png',
      contentUrl: 'https://jestaissupport.zendesk.com/attachments/token/abc',
      contentType: 'image/png',
      size: 512,
    }],
  }), true);
  assert.equal(shouldSyncZendeskCommentToAdo({
    ...baseEvent,
    commentBody: '#sync private support context',
    commentPublic: false,
  }), true);
  assert.equal(shouldSyncZendeskCommentToAdo({
    ...baseEvent,
    commentBody: 'Private support context',
    commentPublic: false,
  }), false);
  assert.equal(shouldSyncZendeskCommentToAdo({
    ...baseEvent,
    commentBody: '[Synced by integration] loop marker',
    commentPublic: true,
  }), false);
});
