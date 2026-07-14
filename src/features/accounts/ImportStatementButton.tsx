import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { ApiError } from '@/api/client';
import type { AccountResponse } from '@/api/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useImportStatement } from '@/features/banking/useImportStatement';
import { useProviders } from '@/features/banking/useProviders';
import { formatSummary, summarize, type Summary } from '@/features/banking/importSummary';
import { matchAccountConnection } from '@/features/banking/matchAccountConnection';
import { DismissButton } from '@/features/banking/DismissButton';

// How long the success toast stays before auto-dismissing.
const SUCCESS_TOAST_MS = 6000;

interface ImportStatementButtonProps {
  selectedAccount: AccountResponse | undefined;
}

export function ImportStatementButton({ selectedAccount }: ImportStatementButtonProps) {
  const { data: config } = useConfiguration();
  const { data: providers } = useProviders();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // The connection that owns this account: enabled, the account id appears as
  // a VALUE (local accountId) in its accountMap, AND its provider supports
  // file import (per /configuration/banking/providers).
  const matched = config?.bankingFeatureEnabled
    ? matchAccountConnection(
        config.banking.connections,
        selectedAccount?.id,
        (c) => providers?.find((p) => p.id === c.provider)?.supportsFile ?? false,
      )
    : undefined;

  // Always call the hook (Rules of Hooks); guard the click on `matched`.
  const importStatement = useImportStatement();

  // Auto-dismiss the success toast; errors stay until dismissed.
  useEffect(() => {
    if (!summary) return;
    const t = setTimeout(() => setSummary(null), SUCCESS_TOAST_MS);
    return () => clearTimeout(t);
  }, [summary]);

  if (!selectedAccount || !matched) return null;

  const onClick = () => {
    setSummary(null);
    setErrorMessage(null);
    fileInputRef.current?.click();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be re-selected later.
    e.target.value = '';
    if (!file || !matched) return;
    importStatement.mutate(
      { connId: matched.id, format: 'csv', file },
      {
        onSuccess: (result) => setSummary(summarize(result)),
        onError: (err) => {
          const message =
            err instanceof ApiError ? err.message : 'Could not import this statement. Try again.';
          setErrorMessage(message);
        },
      },
    );
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Import statement"
              disabled={importStatement.isPending}
              onClick={onClick}
              className="h-9 w-9"
            >
              <Upload className={cn('h-5 w-5', importStatement.isPending && 'animate-pulse')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import statement</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        data-testid="import-statement-file-input"
        className="hidden"
        onChange={onFileSelected}
      />

      {/* Result feedback as a fixed toast so it never disturbs the toolbar layout. */}
      {(summary || errorMessage) && (
        <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
          {summary && (
            <Alert role="status" className="relative pr-9 shadow-lg">
              <AlertDescription>{formatSummary(summary)}</AlertDescription>
              <DismissButton label="Dismiss" onClick={() => setSummary(null)} />
            </Alert>
          )}
          {errorMessage && (
            <Alert role="alert" variant="destructive" className="relative pr-9 shadow-lg">
              <AlertDescription>{errorMessage}</AlertDescription>
              <DismissButton label="Dismiss" onClick={() => setErrorMessage(null)} />
            </Alert>
          )}
        </div>
      )}
    </>
  );
}
