/**
 * Zendesk custom field IDs for the ADO integration fields.
 * Created in jestaissupport.zendesk.com on 2026-04-16.
 *
 * V1 maintains a compact support-facing ADO projection on the ticket. These
 * fields are integration-owned and are cleared together on unlink.
 */
export const ZENDESK_FIELD_IDS: Record<string, number> = {
  dev_funnel_number: 50847215571859,
  ado_work_item_id: 50877199973651,
  ado_work_item_url: 50877235285395,
  ado_status: 50877228156563,
  ado_status_detail: 50877235562259,
  ado_sprint: 50877208001043,
  ado_sprint_start: 50877200183059,
  ado_sprint_end: 50877228323091,
  ado_eta: 50877235803539,
  ado_sync_health: 50877218501395,
  ado_last_sync_at: 50877208248211,
};

/**
 * Zendesk custom field IDs for the *input* fields that drive routing/classification.
 * The webhook inlines these via liquid variables on `event.detail.*`; the sidebar
 * app's immediate-create path reads them directly off the ticket API response.
 */
export const ZENDESK_ROUTING_FIELD_IDS: Record<string, number> = {
  product: 42498755817491,    // "Product*" high-level family, e.g. omni
  org_name: 41539146831251,   // "Org Name"
  case_type: 40990804522131,  // "Case Type"
  crf: 40992814161939,        // "CRF"
  xref: 0,                    // Optional future mapping; set to a live field id when approved.
};
