export interface AppConfig {
  port: number;
  webhookPath: string;
  dryRun: boolean;
  inboundBearerToken?: string;
  zendesk: {
    webhookSecret?: string;
    baseUrl?: string;
    skipSignatureVerification: boolean;
  };
  devAzure: {
    orgUrl: string;
    project: string;
    pat: string;
    workItemType: string;
    areaPath?: string;
    iterationPath?: string;
    assignedTo?: string;
    apiVersion: string;
  };
}

export interface ExistingWorkItem {
  id: string;
  rev: number;
}

export interface ZendeskTicketDetail {
  id: string;
  subject: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  type: string | null;
  tags: string[];
  updatedAt: string | null;
  createdAt: string | null;
  requesterId: string | null;
  assigneeId: string | null;
  organizationId: string | null;
  groupId: string | null;
  brandId: string | null;
  viaChannel: string | null;
}

export interface ZendeskTicketEvent {
  id: string;
  type: string;
  subject: string | null;
  time: string | null;
  zendeskEventVersion: string | null;
  detail: ZendeskTicketDetail;
  commentId: string | null;
  commentBody: string | null;
}

export interface JsonPatchOperation {
  op: 'add' | 'replace' | 'test';
  path: string;
  value?: unknown;
  from?: string | null;
}

export interface DevAzureWorkItemReference {
  id: string;
  url: string;
}

export interface SyncPlan {
  action: 'create' | 'update' | 'noop';
  reason: string;
  ticketId: string;
  workItemType: string;
  title: string;
  operations: JsonPatchOperation[];
  tags: string[];
}
