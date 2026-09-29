import { timingSafeEqual } from 'crypto';

/**
 * Server-only admin password check. The password lives in the ADMIN_PASSWORD
 * env var (never NEXT_PUBLIC_) so it is not shipped to the browser.
 * Fails closed if the env var is unset.
 */
export function isAdminPassword(password: unknown): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== 'string') return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
