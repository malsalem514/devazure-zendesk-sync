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
  central_portal: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision Central Portal',
    customProduct: 'Core-Customer Service Portal',
    confidence: 'high',
  },
  financials: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision Financials',
    customProduct: 'Financials',
    confidence: 'high',
  },
  merch: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision Merchandising and WMS',
    customProduct: 'Core-Merchandising',
    confidence: 'high',
  },
  wms: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision Merchandising and WMS',
    customProduct: 'Core-WMS',
    confidence: 'high',
  },
  snd: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision SnD',
    customProduct: null, // requires module-specific refinement
    confidence: 'high',
  },
  printing: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision Factory Label Printing',
    customProduct: 'Core-Vision Printing',
    confidence: 'medium',
  },
  omni: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Omni POS Mobile Funnel',
    customProduct: 'Core-OMNI',
    confidence: 'medium',
  },
  store: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Omni POS Mobile Funnel',
    customProduct: 'Core-POS',
    confidence: 'medium',
  },
  // Pending business approval — route with low confidence
  bi: {
    project: 'Vision Analytics',
    areaPath: 'Vision Analytics\\Vision Analytics',
    customProduct: null,
    confidence: 'low',
  },
  reports: {
    project: 'Vision Analytics',
    areaPath: 'Vision Analytics\\Vision Analytics',
    customProduct: null,
    confidence: 'low',
  },
  ecomm: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision Central Portal', // best guess
    customProduct: null,
    confidence: 'low',
  },
  planning: {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision Central Portal', // unresolved
    customProduct: null,
    confidence: 'low',
  },
  'planning.net': {
    project: 'VisionSuite',
    areaPath: 'VisionSuite\\Vision Central Portal', // unresolved
    customProduct: null,
    confidence: 'low',
  },
};

const DEFAULT_ROUTE: RouteResult = {
  project: 'VisionSuite',
  areaPath: 'VisionSuite\\Vision Central Portal',
  customProduct: null,
  confidence: 'low',
};

/**
 * Resolve the ADO routing destination for a Zendesk product family.
 * Returns project, area path, product, and confidence level.
 */
export function resolveRoute(productFamily: string | null | undefined): RouteResult {
  if (!productFamily) return DEFAULT_ROUTE;

  const key = productFamily.trim().toLowerCase();
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
