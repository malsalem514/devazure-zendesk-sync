export interface AppConfig {
  port: number;
  webhookPath: string;
  dryRun: boolean;
  inboundBearerToken?: string;
  internalAdminToken?: string;
  adminAlertWebhookUrl?: string;
  commentSyncMaxAgeHours: number;
  maxAttachmentBytes: number;
  zendesk: {
    webhookSecret?: string;
    baseUrl?: string;
    skipSignatureVerification: boolean;
    apiUsername?: string;
    apiToken?: string;
    appSharedSecret?: string;
    appAllowedFormIds: number[];
    appNotifyAppId?: number;
    devCompletedStatusId?: number;
    adoStatusCustomStatusMap: Record<string, number>;
  };
  devAzure: {
    orgUrl: string;
    project: string;
    pat: string;
    workItemType: string;
    areaPath?: string;
    iterationPath?: string;
    assignedTo?: string;
    targetDateField?: string;
    zendeskAssigneeMap: Record<string, string>;
    apiVersion: string;
    webhookPath: string;
    webhookUsername?: string;
    webhookPassword?: string;
  };
  oracle: {
    user: string;
    password: string;
    connectString: string;
    poolMin: number;
    poolMax: number;
  };
}

export interface ExistingWorkItem {
  id: string;
  rev: number;
}

export interface ZendeskTicketDetail {
  id: string;
  ticketFormId: number | null;
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
  // V1 routing and mapping fields (from Zendesk custom fields)
  product: string | null;
  orgName: string | null;
  caseType: string | null;
  crf: string | null;
  xref: string | null;
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
  commentPublic: boolean | null;
  commentAttachments: ZendeskCommentAttachment[];
  supportHandoff?: SupportHandoffFields | null;
}

export interface SupportHandoffFields {
  reproSteps: string | null;
  systemInfo: string | null;
  finalResults: string | null;
  acceptanceCriteria: string | null;
  submittedBy?: string | null;
}

export interface ZendeskCommentAttachment {
  id: string;
  fileName: string;
  contentUrl: string;
  contentType: string | null;
  size: number | null;
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

export interface SidebarActor {
  userId: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
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
