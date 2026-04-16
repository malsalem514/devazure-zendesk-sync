import type { AppConfig, DevAzureWorkItemReference, ExistingWorkItem, JsonPatchOperation } from './types.js';

interface WiqlResponse {
  workItems?: Array<{
    id: number;
    url: string;
  }>;
}

interface WorkItemResponse {
  id: number;
  rev: number;
  url: string;
}

export class DevAzureClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(private readonly config: AppConfig['devAzure']) {
    this.authHeader = `Basic ${Buffer.from(`:${config.pat}`).toString('base64')}`;
    this.baseUrl = `${config.orgUrl.replace(/\/$/, '')}/${config.project}/_apis`;
    this.apiVersion = config.apiVersion;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set('api-version', this.apiVersion);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
    contentType = 'application/json',
  ): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        'Content-Type': contentType,
      },
      body: body == null ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new Error(`DevAzure ${method} ${path} failed with ${response.status}: ${payload}`);
    }

    return response.json() as Promise<T>;
  }

  async findWorkItemByZendeskTicketId(ticketId: string): Promise<ExistingWorkItem | null> {
    if (!/^\d+$/.test(ticketId)) {
      throw new Error(`Invalid Zendesk ticket ID: ${ticketId}`);
    }

    const query = [
      'SELECT [System.Id] FROM WorkItems',
      `WHERE [System.Tags] CONTAINS 'zendesk:id:${ticketId}'`,
      "ORDER BY [System.ChangedDate] DESC",
    ].join(' ');

    const response = await this.request<WiqlResponse>('POST', '/wit/wiql', { query });
    const first = response.workItems?.[0];
    if (!first) {
      return null;
    }

    const workItem = await this.request<WorkItemResponse>('GET', `/wit/workitems/${first.id}`);
    return { id: String(first.id), rev: workItem.rev };
  }

  private toRef(response: WorkItemResponse): DevAzureWorkItemReference {
    return { id: String(response.id), url: response.url };
  }

  async createWorkItem(
    workItemType: string,
    operations: JsonPatchOperation[],
  ): Promise<DevAzureWorkItemReference> {
    const encodedType = `$${encodeURIComponent(workItemType)}`;
    const response = await this.request<WorkItemResponse>(
      'POST',
      `/wit/workitems/${encodedType}`,
      operations,
      'application/json-patch+json',
    );

    return this.toRef(response);
  }

  async updateWorkItem(
    workItemId: string,
    operations: JsonPatchOperation[],
  ): Promise<DevAzureWorkItemReference> {
    const response = await this.request<WorkItemResponse>(
      'PATCH',
      `/wit/workitems/${workItemId}`,
      operations,
      'application/json-patch+json',
    );

    return this.toRef(response);
  }
}
