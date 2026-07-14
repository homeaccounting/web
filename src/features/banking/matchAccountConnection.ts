import type { BankConnectionDTO } from '@/api/types';

// Shared lookup for both banking import flows (pull sync via SyncNowButton and
// statement-file upload via ImportStatementButton): find the enabled
// connection whose accountMap contains `accountId` as a VALUE (local
// accountId), optionally narrowed further (e.g. ImportStatementButton's
// provider-supports-file gate).
export function matchAccountConnection(
  connections: BankConnectionDTO[],
  accountId: string | undefined,
  predicate?: (connection: BankConnectionDTO) => boolean,
): BankConnectionDTO | undefined {
  if (!accountId) return undefined;
  return connections.find(
    (c) => c.enabled && Object.values(c.accountMap).includes(accountId) && (predicate?.(c) ?? true),
  );
}
