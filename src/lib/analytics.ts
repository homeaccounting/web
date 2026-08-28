const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX16 = /^[0-9a-f]{16,}$/i;
const DIGITS = /^\d+$/;

function isIdLike(segment: string): boolean {
  return UUID.test(segment) || DIGITS.test(segment) || HEX16.test(segment);
}

/**
 * Reduce a router pathname to a coarse route pattern safe for analytics:
 * drop the query string entirely and replace id-like segments with `:id`,
 * so account ids, dates, and filters never leave the client.
 */
export function scrubPath(pathname: string): string {
  const path = pathname.split('?')[0] ?? pathname;
  return path
    .split('/')
    .map((segment) => (segment && isIdLike(segment) ? ':id' : segment))
    .join('/');
}
