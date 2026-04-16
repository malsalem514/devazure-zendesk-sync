# Zendesk Azure DevOps V1 Routing Matrix

**Status:** Draft for business review  
**Prepared On:** 2026-04-15  
**Purpose:** Propose the initial routing table for creating Azure DevOps work items from Zendesk.

## 1. Scope

This document covers **new work item creation routing**.

It does not override linked existing items.

Important rule:

- If a Zendesk ticket is linked to an existing Azure DevOps work item, the integration should mirror the actual linked work item's project, area path, product, state, sprint, and ETA.
- The routing matrix below only applies when the agent creates a **new** Azure DevOps item from Zendesk.

## 2. Inputs Used

This routing draft is based on:

- live Zendesk product field options
- live Azure DevOps area-path inventory
- live Azure DevOps `Custom.Product` picklist values
- example Azure DevOps work items:
  - `69491`
  - `78768`
  - `79267`
  - `77931`
  - `79443`

## 3. Routing Principles

Recommended v1 principles:

- Use a **small curated set** of routing destinations.
- Do not expose the full raw ADO area tree as a Zendesk choice set.
- Route by Zendesk **product family** first.
- Map Zendesk detailed product into ADO `Custom.Product`.
- Default new support escalations to Azure DevOps **`Bug`** unless business explicitly wants more than one work item type in v1.

## 4. Observed Product Structures

### Zendesk high-level product families

- `BI`
- `Central_Portal`
- `Financials`
- `Merch`
- `Planning`
- `Printing`
- `Reports`
- `Store`
- `SnD`
- `WMS`
- `Ecomm`
- `Omni`
- `Planning.net`

### Azure DevOps candidate routing areas

- `\\VisionSuite\\Area\\Vision Central Portal`
- `\\VisionSuite\\Area\\Vision Financials`
- `\\VisionSuite\\Area\\Vision Merchandising and WMS`
- `\\VisionSuite\\Area\\Vision SnD`
- `\\VisionSuite\\Area\\Vision Unified Omni`
- `\\VisionSuite\\Area\\Omni POS Mobile Funnel`
- `\\VisionSuite\\Area\\Vision Factory Label Printing`
- `\\VisionSuite\\Area\\Vision Analytics BI Team`
- `\\Vision Analytics\\Area\\Vision Analytics`

### Azure DevOps detailed product values

Examples currently available in ADO:

- `Core-Customer Service Portal`
- `Core-Merchandising`
- `Core-OMNI`
- `Core-POS`
- `Core-WMS`
- `Core-EDOM`
- `Core-Vision Printing`
- `Financials`
- `Mobile-Fulfillment`
- `Mobile-Transfers`
- `Mobile-WMS`
- `SnD-Attribute Center`
- `SnD-Closeout Tool`
- `SnD-Schema Express`
- `SnD-SPI Link`
- `Trade Management Portal`
- `Unified Tax Module`

## 5. Recommended V1 Routing Matrix

| Zendesk `Product*` | Default ADO Project | Default ADO `AreaPath` | Default ADO `Custom.Product` | Confidence | Notes |
| --- | --- | --- | --- | --- | --- |
| `Central_Portal` | `VisionSuite` | `\\VisionSuite\\Area\\Vision Central Portal` | `Core-Customer Service Portal` | High | Cleanest direct domain match |
| `Financials` | `VisionSuite` | `\\VisionSuite\\Area\\Vision Financials` | `Financials` | High | Strong 1:1 family match |
| `Merch` | `VisionSuite` | `\\VisionSuite\\Area\\Vision Merchandising and WMS` | `Core-Merchandising` | High | Good default for non-mobile Merch issues |
| `WMS` | `VisionSuite` | `\\VisionSuite\\Area\\Vision Merchandising and WMS` | `Core-WMS` | High | Good default for non-mobile WMS issues |
| `SnD` | `VisionSuite` | `\\VisionSuite\\Area\\Vision SnD` | `SnD` or matching `SnD-*` value | High | Strong family match; detailed module should refine product |
| `Printing` | `VisionSuite` | `\\VisionSuite\\Area\\Vision Factory Label Printing` | `Core-Vision Printing` | Medium | Printing family splits between Core and SnD variants |
| `Omni` | `VisionSuite` | `\\VisionSuite\\Area\\Omni POS Mobile Funnel` | `Core-OMNI` | Medium | Best match from current examples, but `Vision Unified Omni` is still a candidate |
| `Store` | `VisionSuite` | `\\VisionSuite\\Area\\Omni POS Mobile Funnel` | `Core-POS` | Medium | Best v1 default based on current support-style bug examples |
| `BI` | `Vision Analytics` | `\\Vision Analytics\\Area\\Vision Analytics` | leave blank initially | Medium | ADO product picklist has no obvious BI-specific values |
| `Reports` | `Vision Analytics` | `\\Vision Analytics\\Area\\Vision Analytics` | leave blank initially | Medium | May eventually split to `Vision Analytics BI Team` in VisionSuite |
| `Ecomm` | `VisionSuite` | unresolved | unresolved | Low | ADO products suggest `Core-EDOM`, `Core-Vendor Portal`, `Core-ProShip`, but area-path owner still unclear |
| `Planning` | unresolved | unresolved | `Planning` | Low | No strong dedicated area-path match found yet |
| `Planning.net` | unresolved | unresolved | unresolved | Low | Needs business clarification |

## 6. Detailed Product Heuristics

These heuristics improve `Custom.Product` selection inside each routed family.

### `Central_Portal`

Default:

- `Core-Customer Service Portal`

Use same area path:

- `\\VisionSuite\\Area\\Vision Central Portal`

### `Financials`

Default:

- `Financials`

Use same area path:

- `\\VisionSuite\\Area\\Vision Financials`

### `Merch`

Default:

- `Core-Merchandising`

If Zendesk detailed product suggests mobile merchandising flows, consider:

- `Mobile – Catalog App Merch`
- `Mobile – Cycle Count Merch`
- `Mobile – Inventory Adjustment Merch`
- `Mobile – Place and Locate Merch`
- `Mobile – Receiving without PO Merch`
- `Mobile – RTV Merch`
- `Mobile – Transfers Merch`
- `Mobile – Vendor Creation Merch`

Keep v1 area path:

- `\\VisionSuite\\Area\\Vision Merchandising and WMS`

### `WMS`

Default:

- `Core-WMS`

If Zendesk detailed product implies mobile WMS workflows, consider:

- `Mobile-WMS`
- `Mobile-Cycle Count`
- `Mobile-Place and Locate`

Keep v1 area path:

- `\\VisionSuite\\Area\\Vision Merchandising and WMS`

### `SnD`

Use area path:

- `\\VisionSuite\\Area\\Vision SnD`

Map module-specific detailed products to:

- `SnD-Attribute Center`
- `SnD-Closeout Tool`
- `SnD-Discount Policy`
- `SnD-Factory Label Print`
- `Snd-Product Desc Editor`
- `SnD-Rapid Sales Order Entry`
- `SnD-Schema Express`
- `SnD-Schema Express Trim`
- `SnD-SPI Link`

If no better match:

- `SnD`

### `Printing`

Default:

- `Core-Vision Printing`

If the Zendesk detailed product clearly refers to factory label printing:

- use `SnD-Factory Label Print`

Default area path in v1:

- `\\VisionSuite\\Area\\Vision Factory Label Printing`

### `Omni`

Default:

- `Core-OMNI`

If the Zendesk detailed product points to specific mobile flows, use:

- `Mobile-Fulfillment`
- `Mobile-Pick Up`
- `Mobile-Transfers`
- `Mobile-Customer Wallet`

If the issue is really POS-centered:

- `Core-POS`

Recommended v1 area path:

- `\\VisionSuite\\Area\\Omni POS Mobile Funnel`

Open question:

- whether non-mobile omni issues should eventually route to `\\VisionSuite\\Area\\Vision Unified Omni`

### `Store`

Default:

- `Core-POS`

If the detailed Zendesk product implies fulfillment, transfers, or mobile POS:

- `Mobile-Fulfillment`
- `Mobile-Transfers`
- `Mobile-POS`

Recommended v1 area path:

- `\\VisionSuite\\Area\\Omni POS Mobile Funnel`

Reason:

- current support examples already land here with `Core-POS`, `Mobile-Fulfillment`, and `Mobile-Transfers`

### `BI` and `Reports`

Recommended v1 project and area:

- Project: `Vision Analytics`
- Area: `\\Vision Analytics\\Area\\Vision Analytics`

Current issue:

- ADO `Custom.Product` does not present a clean BI/reporting family equivalent.

Recommended v1 behavior:

- route by area path
- leave `Custom.Product` blank until the business confirms a reporting-specific product strategy

## 7. Creation Defaults

Recommended v1 creation defaults:

| Field | Value |
| --- | --- |
| Work item type | `Bug` |
| Project | from routing matrix |
| Area path | from routing matrix |
| Iteration path | project/team default root unless business provides a better rule |
| `Custom.Bucket` | `Support` |
| `Custom.Unplanned` | `true` |
| `Microsoft.VSTS.Common.ValueArea` | `Business` |

## 8. Link Existing Behavior

When linking an existing Azure DevOps item:

- do not re-route it
- do not overwrite its project or area path with routing defaults
- read and mirror:
  - project
  - area path
  - iteration path
  - state
  - `Custom.Product`
  - sprint dates
  - ETA

This matters because an existing item may already be in:

- a different area path
- a different bucket
- a dated sprint
- a resolved or completed state

## 9. Biggest Gaps Before Approval

- Confirm the correct v1 home for `Ecomm`
- Confirm the correct v1 home for `Planning`
- Confirm the correct v1 home for `Planning.net`
- Confirm whether `BI` and `Reports` should go to `Vision Analytics` or `Vision Analytics BI Team`
- Confirm whether `Omni` should default to `Vision Unified Omni` or `Omni POS Mobile Funnel`
- Confirm whether `Store` should always default to `Omni POS Mobile Funnel`

## 10. Recommended Approval Path

1. Approve the routing matrix only for:
   - `Central_Portal`
   - `Financials`
   - `Merch`
   - `WMS`
   - `SnD`
   - `Printing`
   - `Omni`
   - `Store`
2. Mark `BI`, `Reports`, `Ecomm`, `Planning`, and `Planning.net` as pending.
3. Launch v1 with the approved subset.
4. Add the pending families after one round of pilot feedback.
