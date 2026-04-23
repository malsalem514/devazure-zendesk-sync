import { buildBasicAuthHeaderValue } from './lib/basic-auth.js';
import type { AppConfig, DevAzureWorkItemReference, ExistingWorkItem, JsonPatchOperation } from './types.js';
import type { IterationMetadata } from './ado-status.js';

export class DevAzureHttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export class DevAzureTimeoutError extends DevAzureHttpError {
  constructor(method: string, path: string, timeoutMs: number) {
    super(504, `DevAzure ${method} ${path} timed out after ${timeoutMs}ms`);
  }
}

const DEVAZURE_REQUEST_TIMEOUT_MS = 10_000;

function isAbortLikeError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

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
  workItemType: string | null;
  reason: string | null;
  state: string | null;
  areaPath: string | null;
  iterationPath: string | null;
  title: string | null;
  assignedTo: string | null;
  priority: number | null;
  severity: string | null;
  createdAt: string | null;
  changedAt: string | null;
  product: string | null;
  client: string | null;
  crf: string | null;
  bucket: string | null;
  unplanned: boolean | null;
  tags: string[];
  fields: Record<string, unknown>;
}

export class DevAzureClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(private readonly config: AppConfig['devAzure']) {
    this.authHeader = buildBasicAuthHeaderValue('', config.pat);
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
    let response: Response;
    try {
      response = await fetch(this.buildUrl(path), {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
          'Content-Type': contentType,
        },
        body: body == null ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(DEVAZURE_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (isAbortLikeError(err)) {
        throw new DevAzureTimeoutError(method, path, DEVAZURE_REQUEST_TIMEOUT_MS);
      }
      throw err;
    }

    if (!response.ok) {
      const payload = await response.text();
      throw new DevAzureHttpError(
        response.status,
        `DevAzure ${method} ${path} failed with ${response.status}: ${payload}`,
      );
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
    // Fetch only the fields the reverse-sync handler actually reads — ADO
    // work items carry dozens of custom fields we'd otherwise download+parse.
    const fieldList = [
      'System.WorkItemType',
      'System.Reason',
      'System.State',
      'System.AreaPath',
      'System.IterationPath',
      'System.Title',
      'System.AssignedTo',
      'System.Tags',
      'System.CreatedDate',
      'System.ChangedDate',
      'Microsoft.VSTS.Common.Priority',
      'Microsoft.VSTS.Common.Severity',
      'Custom.Product',
      'Custom.Client',
      'Custom.CRF',
      'Custom.Bucket',
      'Custom.Unplanned',
    ].join(',');
    try {
      const response = await this.request<WorkItemResponse>(
        'GET',
        `/wit/workitems/${workItemId}?fields=${fieldList}`,
      );
      const fields = response.fields ?? {};
      const rawTags = (fields['System.Tags'] as string | undefined) ?? '';
      return {
        id: String(response.id),
        rev: response.rev,
        url: response.url,
        workItemType: fieldString(fields, 'System.WorkItemType'),
        reason: fieldString(fields, 'System.Reason'),
        state: fieldString(fields, 'System.State'),
        areaPath: fieldString(fields, 'System.AreaPath'),
        iterationPath: fieldString(fields, 'System.IterationPath'),
        title: fieldString(fields, 'System.Title'),
        assignedTo: extractDisplayName(fields['System.AssignedTo']),
        priority: fieldNumber(fields, 'Microsoft.VSTS.Common.Priority'),
        severity: fieldString(fields, 'Microsoft.VSTS.Common.Severity'),
        createdAt: fieldString(fields, 'System.CreatedDate'),
        changedAt: fieldString(fields, 'System.ChangedDate'),
        product: fieldString(fields, 'Custom.Product'),
        client: fieldString(fields, 'Custom.Client'),
        crf: fieldString(fields, 'Custom.CRF'),
        bucket: fieldString(fields, 'Custom.Bucket'),
        unplanned: fieldBoolean(fields, 'Custom.Unplanned'),
        tags: rawTags
          .split(';')
          .map((t) => t.trim())
          .filter((t) => t.length > 0),
        fields,
      };
    } catch (err) {
      if (err instanceof DevAzureHttpError && err.status === 404) return null;
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
      return {
        displayName: response.name,
        startDate: response.attributes?.startDate ?? null,
        finishDate: response.attributes?.finishDate ?? null,
      };
    } catch (err) {
      if (err instanceof DevAzureHttpError && err.status === 404) return null;
      throw err;
    }
  }
}

function fieldString(fields: Record<string, unknown>, refName: string): string | null {
  const value = fields[refName];
  if (value == null) return null;
  const stringValue = String(value).trim();
  return stringValue === '' ? null : stringValue;
}

function fieldNumber(fields: Record<string, unknown>, refName: string): number | null {
  const value = fields[refName];
  if (value == null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function fieldBoolean(fields: Record<string, unknown>, refName: string): boolean | null {
  const value = fields[refName];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return null;
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
