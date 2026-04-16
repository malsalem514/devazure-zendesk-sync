import type { AppConfig, DevAzureWorkItemReference, ExistingWorkItem, JsonPatchOperation } from './types.js';
import type { IterationMetadata } from './ado-status.js';

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
  fields?: Record<string, unknown>;
}

interface ClassificationNodeResponse {
  id: number;
  name: string;
  path?: string;
  attributes?: {
    startDate?: string;
    finishDate?: string;
  };
}

export interface AdoWorkItemSnapshot {
  id: string;
  rev: number;
  url: string;
  state: string | null;
  iterationPath: string | null;
  title: string | null;
  assignedTo: string | null;
  tags: string[];
  fields: Record<string, unknown>;
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

  /**
   * Fetch a full work item snapshot — used by the reverse-sync handler to
   * derive `ADO Status`, sprint context, and the fingerprint for no-op skip.
   */
  async getWorkItem(workItemId: string | number): Promise<AdoWorkItemSnapshot | null> {
    if (!/^\d+$/.test(String(workItemId))) {
      throw new Error(`Invalid ADO work item ID: ${workItemId}`);
    }
    try {
      const response = await this.request<WorkItemResponse>(
        'GET',
        `/wit/workitems/${workItemId}?$expand=fields`,
      );
      const fields = response.fields ?? {};
      const rawTags = (fields['System.Tags'] as string | undefined) ?? '';
      return {
        id: String(response.id),
        rev: response.rev,
        url: response.url,
        state: (fields['System.State'] as string | undefined) ?? null,
        iterationPath: (fields['System.IterationPath'] as string | undefined) ?? null,
        title: (fields['System.Title'] as string | undefined) ?? null,
        assignedTo: extractDisplayName(fields['System.AssignedTo']),
        tags: rawTags
          .split(';')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
        fields,
      };
    } catch (err) {
      if (err instanceof Error && /failed with 404/.test(err.message)) return null;
      throw err;
    }
  }

  /**
   * Fetch iteration metadata (display name + dated range) via the ADO
   * classification nodes API. Returns `null` on 404 so callers can skip the
   * cache write and fall through to "no sprint" rendering.
   */
  async getIteration(iterationPath: string): Promise<IterationMetadata | null> {
    const projectPrefix = `${this.config.project}\\`;
    const relative = iterationPath.startsWith(projectPrefix)
      ? iterationPath.slice(projectPrefix.length)
      : iterationPath;

    const encoded = relative
      .split('\\')
      .filter((segment) => segment.length > 0)
      .map(encodeURIComponent)
      .join('/');

    if (!encoded) return null;

    try {
      const response = await this.request<ClassificationNodeResponse>(
        'GET',
        `/wit/classificationnodes/Iterations/${encoded}?$depth=0`,
      );
      const startDate = response.attributes?.startDate ?? null;
      const finishDate = response.attributes?.finishDate ?? null;
      return {
        displayName: response.name,
        startDate,
        finishDate,
        hasDatedRange: Boolean(startDate && finishDate),
      };
    } catch (err) {
      if (err instanceof Error && /failed with 404/.test(err.message)) return null;
      throw err;
    }
  }
}

function extractDisplayName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && 'displayName' in value) {
    const name = (value as { displayName?: unknown }).displayName;
    return typeof name === 'string' ? name : null;
  }
  return null;
}
