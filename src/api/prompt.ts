import type { ApiClient } from './client';
import type { PromptRequest, PromptResponse } from './types';

// POST /api/prompt — interpret a natural-language prompt and record 1..N
// transactions against the given account. See server-infra/src/Web/API/PromptAPI.hs.
export const promptApi = (client: ApiClient) => ({
  submit: (body: PromptRequest): Promise<PromptResponse> =>
    client.post<PromptResponse>('/api/prompt', body),
});
