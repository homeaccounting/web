import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { ApiError } from '@/api/client';
import type { AccountResponse } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useImportStatement } from '@/features/banking/useImportStatement';
import { useProviders } from '@/features/banking/useProviders';
import { formatSummary, summarize } from '@/features/banking/importSummary';
import { matchAccountConnection } from '@/features/banking/matchAccountConnection';
import { STATEMENT_FILE_ACCEPT, statementFormatForFiles } from '@/features/banking/statementFormat';

interface ImportStatementButtonProps {
  selectedAccount: AccountResponse | undefined;
}

export function ImportStatementButton({ selectedAccount }: ImportStatementButtonProps) {
  const { data: config } = useConfiguration();
  const { data: providers } = useProviders();
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

  if (!selectedAccount || !matched) return null;

  const onClick = () => {
    fileInputRef.current?.click();
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    // Reset the input so the same files can be re-selected later.
    e.target.value = '';
    if (files.length === 0 || !matched) return;
    const resolved = statementFormatForFiles(files);
    if ('error' in resolved) {
      toast.error(resolved.error);
      return;
    }
    importStatement.mutate(
      // All selected files go in one request so the backend concatenates them
      // into a single batch (cross-file transfers pair). One file is just N=1.
      // Format (csv/xlsx) is derived from the picked file's extension.
      { connId: matched.id, format: resolved.format, files },
      {
        onSuccess: (result) => toast.success(formatSummary(summarize(result))),
        onError: (err) => {
          const message =
            err instanceof ApiError ? err.message : 'Couldn’t import this statement. Try again.';
          toast.error(message);
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
        accept={STATEMENT_FILE_ACCEPT}
        multiple
        data-testid="import-statement-file-input"
        className="hidden"
        onChange={onFileSelected}
      />
    </>
  );
}
