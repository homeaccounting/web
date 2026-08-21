import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { ApiError } from '@/api/client';
import type { AccountResponse } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useImportConnection } from '@/features/banking/useImportConnection';
import { useProviders } from '@/features/banking/useProviders';
import { formatSummary, summarize } from '@/features/banking/importSummary';
import { matchAccountConnection } from '@/features/banking/matchAccountConnection';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Pure 30-day window helper. `to` is `now`; `from` is 30 days earlier. */
export function last30Days(now: Date): { from: string; to: string } {
  return {
    from: new Date(now.getTime() - THIRTY_DAYS_MS).toISOString(),
    to: now.toISOString(),
  };
}

interface SyncNowButtonProps {
  selectedAccount: AccountResponse | undefined;
}

export function SyncNowButton({ selectedAccount }: SyncNowButtonProps) {
  const { t } = useTranslation('accounts');
  const { data: config } = useConfiguration();
  const { data: providers } = useProviders();

  // The connection that owns this account: enabled, the account id appears as
  // a VALUE (local accountId) in its accountMap, AND its provider supports
  // pull sync (per /configuration/banking/providers). Fail-closed: hidden
  // until providers resolve, same as ImportStatementButton's file-support gate.
  const matched = config?.bankingFeatureEnabled
    ? matchAccountConnection(
        config.banking.connections,
        selectedAccount?.id,
        (c) => providers?.find((p) => p.id === c.provider)?.supportsPull ?? false,
      )
    : undefined;

  // Always call the hook (Rules of Hooks); guard the click on `matched`.
  const importConnection = useImportConnection(matched?.id ?? '');

  if (!selectedAccount || !matched) return null;

  const onClick = () => {
    const { from, to } = last30Days(new Date());
    importConnection.mutate(
      { from, to },
      {
        onSuccess: (result) => toast.success(formatSummary(summarize(result))),
        onError: (err) => {
          // Defensively surface 422 CONNECTION_DISABLED / 404 / FEATURE_DISABLED
          // and any other ApiError; the gating already prevents most of these,
          // but a mid-session toggle could race.
          const message = err instanceof ApiError ? err.message : t('syncButton.error');
          toast.error(message);
        },
      },
    );
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('syncButton.label')}
            disabled={importConnection.isPending}
            onClick={onClick}
            className="h-9 w-9"
          >
            <RefreshCw className={cn('h-5 w-5', importConnection.isPending && 'animate-spin')} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('syncButton.label')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
