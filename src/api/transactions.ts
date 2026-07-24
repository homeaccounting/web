import type {
  AmendTransactionRequest,
  LinkRelationRequest,
  ChangeTransactionDateRequest,
  ChangeTransactionDescriptionRequest,
  ExpenseRequest,
  ISO8601,
  IncomeRequest,
  InternalTransferRequest,
  MergeTransactionsRequest,
  RelationKind,
  SetTransactionAllocationsRequest,
  SetTransactionContactRequest,
  SetTransactionLabelsRequest,
  TransactionListResponse,
  TransactionRelationsResponse,
  TransactionResponse,
  UUID,
} from './types';
import type { ApiClient } from './client';

export const transactionsApi = (client: ApiClient) => ({
  get: (id: UUID): Promise<TransactionResponse> =>
    client.get<TransactionResponse>(`/api/transactions/${id}`),
  relations: (id: UUID): Promise<TransactionRelationsResponse> =>
    client.get<TransactionRelationsResponse>(`/api/transactions/${id}/relations`),
  linkRelation: (id: UUID, body: LinkRelationRequest): Promise<TransactionResponse> =>
    client.post<TransactionResponse>(`/api/transactions/${id}/relations`, body),
  // Merge the listed source transactions into `id` (the target/survivor).
  // Backend POST /api/transactions/:id/merge composes the combined amount +
  // allocations onto the target, cancels each source, and records a `merge`
  // lineage edge per source→target — atomically as a single domain operation
  // (Web/API/TransactionAPI.hs `mergeTransactionsHandler`). Returns the
  // refreshed target.
  merge: (id: UUID, body: MergeTransactionsRequest): Promise<TransactionResponse> =>
    client.post<TransactionResponse>(`/api/transactions/${id}/merge`, body),
  unlinkRelation: (
    id: UUID,
    params: { relatedTransactionId: UUID; relationKind: RelationKind },
  ): Promise<TransactionResponse> => {
    const qs = new URLSearchParams({
      relatedTransactionId: params.relatedTransactionId,
      relationKind: params.relationKind,
    });
    return client.delete<TransactionResponse>(`/api/transactions/${id}/relations?${qs.toString()}`);
  },
  // `accountId` is OPTIONAL: the backend `GET /api/transactions` treats it as an
  // optional query param (Web/API/TransactionAPI.hs, `QueryParam "accountId"`);
  // omitting it lists across ALL of the user's accounts.
  list: async (params: {
    accountId?: UUID;
    dateFrom?: ISO8601;
    dateTo?: ISO8601;
    limit?: number;
    offset?: number;
  }): Promise<TransactionListResponse> => {
    const qs = new URLSearchParams();
    if (params.accountId) qs.set('accountId', params.accountId);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    return client.get<TransactionListResponse>(`/api/transactions?${qs.toString()}`);
  },
  createIncome: (body: IncomeRequest): Promise<TransactionResponse> =>
    client.post<TransactionResponse>('/api/transactions/income', body),
  createExpense: (body: ExpenseRequest): Promise<TransactionResponse> =>
    client.post<TransactionResponse>('/api/transactions/expense', body),
  createTransfer: (body: InternalTransferRequest): Promise<TransactionResponse> =>
    client.post<TransactionResponse>('/api/transactions/transfer', body),
  setDescription: (id: UUID, body: ChangeTransactionDescriptionRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/description`, body),
  setDate: (id: UUID, body: ChangeTransactionDateRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/date`, body),
  setLabels: (id: UUID, body: SetTransactionLabelsRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/labels`, body),
  setContact: (id: UUID, body: SetTransactionContactRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/contact`, body),
  setAllocations: (id: UUID, body: SetTransactionAllocationsRequest) =>
    client.patch<TransactionResponse>(`/api/transactions/${id}/allocations`, body),
  amend: (id: UUID, body: AmendTransactionRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/amendment`, body),
  // Soft-cancel a transaction. Backend DELETE /api/transactions/:id returns 204
  // (Web/API/TransactionAPI.hs `cancelTransactionHandler`); the resulting status
  // is `Cancelled`. There is no hard delete.
  cancel: (id: UUID): Promise<void> => client.delete<void>(`/api/transactions/${id}`),
});
