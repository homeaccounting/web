import type {
  AmendTransactionRequest,
  ChangeTransactionDateRequest,
  ChangeTransactionDescriptionRequest,
  ExpenseRequest,
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
  list: async (params: { accountId: UUID }): Promise<TransactionResponse[]> => {
    const qs = new URLSearchParams({ accountId: params.accountId }).toString();
    const res = await client.get<TransactionListResponse>(`/api/transactions?${qs}`);
    return res.transactions;
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
});
