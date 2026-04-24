import type { SidebarActor } from '../types.js';
import type { ZafClaims } from './zaf-auth.js';

function cleanClaim(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

export function sidebarActorFromClaims(claims: ZafClaims): SidebarActor {
  return {
    userId: cleanClaim(claims.zendesk_user_id ?? claims.user_id ?? claims.sub),
    name: cleanClaim(claims.zendesk_user_name ?? claims.name),
    email: cleanClaim(claims.zendesk_user_email ?? claims.email),
    role: cleanClaim(claims.zendesk_user_role ?? claims.role),
  };
}

export function formatSidebarActor(actor: SidebarActor | null | undefined): string {
  if (!actor) return 'Unknown Zendesk agent';

  const primary = actor.name ?? actor.email ?? actor.userId ?? 'Unknown Zendesk agent';
  const details = [
    actor.email && actor.email !== primary ? actor.email : null,
    actor.userId ? `Zendesk user ${actor.userId}` : null,
    actor.role,
  ].filter((value): value is string => value != null && value.trim() !== '');

  return details.length > 0 ? `${primary} (${details.join(', ')})` : primary;
}

export function formatSidebarActorAuditSummary(actor: SidebarActor | null | undefined): string {
  return `Agent ${formatSidebarActor(actor)}`;
}
