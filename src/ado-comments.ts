import type { AdoWorkItemComment } from './devazure-client.js';

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, code) => {
      const parsed = Number.parseInt(code, 10);
      if (!Number.isFinite(parsed)) return match;
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return match;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const parsed = Number.parseInt(code, 16);
      if (!Number.isFinite(parsed)) return match;
      try {
        return String.fromCodePoint(parsed);
      } catch {
        return match;
      }
    });
}

export function cleanAdoCommentText(text: string | null): string | null {
  if (text == null) return null;

  const textWithLayout = text
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(div|p|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '');

  const cleaned = decodeHtmlEntities(textWithLayout)
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return cleaned === '' ? null : cleaned;
}

export function isIntegrationAdoComment(text: string | null): boolean {
  const normalized = cleanAdoCommentText(text)?.trim() ?? '';
  return (
    normalized.startsWith('[Synced from Zendesk by integration]') ||
    normalized.startsWith('[Synced by sidebar]') ||
    normalized.startsWith('[Synced by integration]') ||
    normalized.startsWith('Synced from Zendesk event zen:event-type:') ||
    normalized.startsWith('Synced from Zendesk ticket #')
  );
}

export function prepareRecentAdoComments(
  comments: AdoWorkItemComment[],
  limit = 3,
): AdoWorkItemComment[] {
  const safeLimit = Math.max(0, Math.trunc(limit));
  if (safeLimit === 0) return [];

  const prepared: AdoWorkItemComment[] = [];
  for (const comment of comments) {
    if (isIntegrationAdoComment(comment.text)) continue;

    const text = cleanAdoCommentText(comment.text);
    if (!text) continue;

    prepared.push({ ...comment, text });
    if (prepared.length >= safeLimit) break;
  }

  return prepared;
}
