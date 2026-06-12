import type {
  AmendTransactionRequest,
  ChangeTransactionDateRequest,
  ChangeTransactionDescriptionRequest,
  ExpenseRequest,
  ISO8601,
  IncomeRequest,
  InternalTransferRequest,
  SetTransactionAllocationsRequest,
  SetTransactionLabelsRequest,
  TransactionListResponse,
  TransactionResponse,
  UUID,
} from './types';
import type { ApiClient } from './client';

export const transactionsApi = (client: ApiClient) => ({
  list: async (params: {
    accountId: UUID;
    dateFrom?: ISO8601;
    dateTo?: ISO8601;
    limit?: number;
    offset?: number;
  }): Promise<TransactionListResponse> => {
    const qs = new URLSearchParams({ accountId: params.accountId });
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
  setAllocations: (id: UUID, body: SetTransactionAllocationsRequest) =>
    client.patch<TransactionResponse>(`/api/transactions/${id}/allocations`, body),
  amend: (id: UUID, body: AmendTransactionRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/amendment`, body),
  // Soft-cancel a transaction. Backend DELETE /api/transactions/:id returns 204
  // (Web/API/TransactionAPI.hs `cancelTransactionHandler`); the resulting status
  // is `Cancelled`. There is no hard delete.
  cancel: (id: UUID): Promise<void> => client.delete<void>(`/api/transactions/${id}`),
});
