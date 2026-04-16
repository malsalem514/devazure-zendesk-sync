/**
 * V1 routing matrix for creating Azure DevOps work items from Zendesk.
 * Source: docs/proposals/ZENDESK-ADO-V1-ROUTING-MATRIX.md
 *
 * Only applies to NEW work item creation. Linked existing items keep
 * their actual project, area path, and product.
 */

export interface RouteResult {
  project: string;
  areaPath: string;
  customProduct: string | null;
  confidence: 'high' | 'medium' | 'low';
}

const ROUTE_TABLE: Record<string, RouteResult> = {
  Central_Portal: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision Central Portal',
    customProduct: 'Core-Customer Service Portal',
    confidence: 'high',
  },
  Financials: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision Financials',
    customProduct: 'Financials',
    confidence: 'high',
  },
  Merch: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision Merchandising and WMS',
    customProduct: 'Core-Merchandising',
    confidence: 'high',
  },
  WMS: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision Merchandising and WMS',
    customProduct: 'Core-WMS',
    confidence: 'high',
  },
  SnD: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision SnD',
    customProduct: null, // requires module-specific refinement
    confidence: 'high',
  },
  Printing: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision Factory Label Printing',
    customProduct: 'Core-Vision Printing',
    confidence: 'medium',
  },
  Omni: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Omni POS Mobile Funnel',
    customProduct: 'Core-OMNI',
    confidence: 'medium',
  },
  Store: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Omni POS Mobile Funnel',
    customProduct: 'Core-POS',
    confidence: 'medium',
  },
  // Pending business approval — route with low confidence
  BI: {
    project: 'Vision Analytics',
    areaPath: '\\Vision Analytics\\Area\\Vision Analytics',
    customProduct: null,
    confidence: 'low',
  },
  Reports: {
    project: 'Vision Analytics',
    areaPath: '\\Vision Analytics\\Area\\Vision Analytics',
    customProduct: null,
    confidence: 'low',
  },
  Ecomm: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision Central Portal', // best guess
    customProduct: null,
    confidence: 'low',
  },
  Planning: {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision Central Portal', // unresolved
    customProduct: null,
    confidence: 'low',
  },
  'Planning.net': {
    project: 'VisionSuite',
    areaPath: '\\VisionSuite\\Area\\Vision Central Portal', // unresolved
    customProduct: null,
    confidence: 'low',
  },
};

const DEFAULT_ROUTE: RouteResult = {
  project: 'VisionSuite',
  areaPath: '\\VisionSuite\\Area\\Vision Central Portal',
  customProduct: null,
  confidence: 'low',
};

/**
 * Resolve the ADO routing destination for a Zendesk product family.
 * Returns project, area path, product, and confidence level.
 */
export function resolveRoute(productFamily: string | null | undefined): RouteResult {
  if (!productFamily) return DEFAULT_ROUTE;

  const key = productFamily.trim();
  const entry = ROUTE_TABLE[key];
  if (entry) return entry;

  return DEFAULT_ROUTE;
}

/**
 * Map Zendesk Case Type to ADO work item type.
 * Source: tech spec section 7, field mapping table.
 */
export function resolveWorkItemType(caseType: string | null | undefined): string {
  if (!caseType) return 'Bug';

  const normalized = caseType.trim().toLowerCase();
  if (normalized === 'defect' || normalized === 'bug') return 'Bug';
  if (normalized === 'enhancement request' || normalized === 'enhancement') return 'User Story';
  if (normalized === 'training request') return 'Task';
  if (normalized === 'data fix') return 'Task';
  return 'Bug';
}
