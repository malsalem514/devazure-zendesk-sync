import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ZafClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  [key: string]: unknown;
}

export class ZafAuthError extends Error {
  constructor(message: string, public readonly statusCode = 401) {
    super(message);
  }
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

export function verifyZafJwt(
  token: string,
  secret: string,
  opts: { expectedIssuer?: string; clockSkewSeconds?: number } = {},
): ZafClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new ZafAuthError('Malformed JWT');
  }
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  } catch {
    throw new ZafAuthError('Malformed JWT header');
  }
  if (header.alg !== 'HS256') {
    throw new ZafAuthError(`Unsupported JWT alg: ${header.alg}`);
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret).update(signingInput).digest();
  const providedSig = base64UrlDecode(signatureB64);
  if (
    expectedSig.length !== providedSig.length ||
    !timingSafeEqual(expectedSig, providedSig)
  ) {
    throw new ZafAuthError('JWT signature mismatch');
  }

  let payload: ZafClaims;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new ZafAuthError('Malformed JWT payload');
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = opts.clockSkewSeconds ?? 30;

  if (typeof payload.exp === 'number' && payload.exp + skew < now) {
    throw new ZafAuthError('JWT expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - skew > now) {
    throw new ZafAuthError('JWT not yet valid');
  }

  if (opts.expectedIssuer && payload.iss !== opts.expectedIssuer) {
    throw new ZafAuthError(`Unexpected issuer: ${payload.iss}`);
  }

  return payload;
}

export function signTestJwt(payload: ZafClaims, secret: string): string {
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const signature = base64UrlEncode(createHmac('sha256', secret).update(signingInput).digest());
  return `${header}.${body}.${signature}`;
}

export function verifyAuthorizationHeader(
  authorizationHeader: string | undefined,
  secret: string,
  opts?: { expectedIssuer?: string; clockSkewSeconds?: number },
): ZafClaims {
  if (!authorizationHeader) {
    throw new ZafAuthError('Missing Authorization header');
  }
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) {
    throw new ZafAuthError('Authorization header must use Bearer scheme');
  }
  return verifyZafJwt(match[1], secret, opts);
}
