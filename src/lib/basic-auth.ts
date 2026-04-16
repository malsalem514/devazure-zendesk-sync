/**
 * Build an HTTP `Basic` auth header value — shared by the ADO client (PAT as
 * password) and the ADO webhook receiver (shared secret).
 */
export function buildBasicAuthHeaderValue(username: string, password: string): string {
  const token = Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
  return `Basic ${token}`;
}
