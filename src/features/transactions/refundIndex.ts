import type { TransactionResponse } from '@/api/types';
import { buildRelationIndex, type RelationStat } from './relationIndex';

/** @deprecated use RelationStat from './relationIndex'. Kept for existing callers. */
export type RefundStat = RelationStat;

/** Map originalId → aggregate of refunds pointing at it, from the loaded window. */
export function buildRefundIndex(transactions: TransactionResponse[]): Map<string, RefundStat> {
  return buildRelationIndex(transactions, 'refund');
}
