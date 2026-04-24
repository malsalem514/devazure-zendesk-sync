import type { AppConfig, ZendeskTicketEvent } from '../types.js';
import { getTicketRaw } from './zendesk-api.js';

export class ZendeskTicketScopeError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
  }
}

export function extractZendeskTicketFormId(ticket: Record<string, unknown> | null): number | null {
  if (!ticket) return null;

  const raw = ticket.ticket_form_id ?? ticket.form_id ?? ticket.ticketFormId;
  if (raw == null || raw === '') return null;

  const parsed = Number.parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isZendeskTicketAllowedForSidebar(
  ticket: Record<string, unknown> | null,
  allowedFormIds: number[],
): boolean {
  if (allowedFormIds.length === 0) return true;

  const formId = extractZendeskTicketFormId(ticket);
  return formId != null && allowedFormIds.includes(formId);
}

export async function isZendeskTicketEventAllowedForAutomation(
  config: AppConfig,
  event: ZendeskTicketEvent,
): Promise<boolean> {
  const allowedFormIds = config.zendesk.appAllowedFormIds;
  if (allowedFormIds.length === 0) return true;

  if (event.detail.ticketFormId != null) {
    return allowedFormIds.includes(event.detail.ticketFormId);
  }

  const ticket = await getTicketRaw(config, event.detail.id);
  return isZendeskTicketAllowedForSidebar(ticket, allowedFormIds);
}

export async function assertZendeskTicketAllowedForSidebar(
  config: AppConfig,
  ticketIdRaw: string,
): Promise<void> {
  if (!/^\d+$/.test(ticketIdRaw)) {
    throw new ZendeskTicketScopeError(`Invalid Zendesk ticket ID: ${ticketIdRaw}`, 400);
  }

  const allowedFormIds = config.zendesk.appAllowedFormIds;
  if (allowedFormIds.length === 0) return;

  const ticketId = Number(ticketIdRaw);
  const ticket = await getTicketRaw(config, ticketId);
  if (!ticket) {
    throw new ZendeskTicketScopeError(`Zendesk ticket #${ticketId} not found`, 404);
  }

  if (!isZendeskTicketAllowedForSidebar(ticket, allowedFormIds)) {
    throw new ZendeskTicketScopeError(
      `Zendesk ticket #${ticketId} is outside the approved sidebar app form scope`,
      403,
    );
  }
}
