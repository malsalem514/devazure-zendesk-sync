import { createHmac, timingSafeEqual } from 'node:crypto';

function toComparableBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf8');
}

export function createZendeskSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}${rawBody}`)
    .digest('base64');
}

export function verifyZendeskSignature(
  secret: string,
  signature: string | undefined,
  timestamp: string | undefined,
  rawBody: string,
): boolean {
  if (!signature || !timestamp) {
    return false;
  }

  const expected = toComparableBuffer(createZendeskSignature(secret, timestamp, rawBody));
  const received = toComparableBuffer(signature);

  if (expected.length !== received.length) {
    return false;
  }

  return timingSafeEqual(expected, received);
}
