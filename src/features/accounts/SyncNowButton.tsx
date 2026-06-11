import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { ApiError } from '@/api/client';
import type { AccountResponse, ResyncResponse } from '@/api/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useResync } from '@/features/banking/useResync';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
// How long the success toast stays before auto-dismissing.
const SUCCESS_TOAST_MS = 6000;

/** Pure 30-day window helper. `to` is `now`; `from` is 30 days earlier. */
export function last30Days(now: Date): { from: string; to: string } {
  return {
    from: new Date(now.getTime() - THIRTY_DAYS_MS).toISOString(),
    to: now.toISOString(),
  };
}

interface Summary {
  imported: number;
  skipped: number;
  failed: number;
}

function summarize(result: ResyncResponse): Summary {
  return result.accounts.reduce(
    (acc, r) => ({
      imported: acc.imported + r.importedCount,
      skipped: acc.skipped + r.skippedCount,
      failed: acc.failed + r.failureCount,
    }),
    { imported: 0, skipped: 0, failed: 0 },
  );
}

/** Human-friendly summary; only surfaces skipped/failed when they're non-zero. */
function formatSummary(s: Summary): string {
  const parts = [`Imported ${s.imported} transaction${s.imported === 1 ? '' : 's'}`];
  if (s.skipped > 0) parts.push(`${s.skipped} skipped`);
  if (s.failed > 0) parts.push(`${s.failed} failed`);
  return parts.join(' · ');
}

interface SyncNowButtonProps {
  selectedAccount: AccountResponse | undefined;
}

export function SyncNowButton({ selectedAccount }: SyncNowButtonProps) {
  const { data: config } = useConfiguration();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // The connection that owns this account: enabled, and the account id appears
  // as a VALUE (local accountId) in its accountMap.
  const matched = config?.bankingFeatureEnabled
    ? config.banking.connections.find(
        (c) => c.enabled && Object.values(c.accountMap).includes(selectedAccount?.id ?? ''),
      )
    : undefined;

  // Always call the hook (Rules of Hooks); guard the click on `matched`.
  const resync = useResync(matched?.id ?? '');

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
    const { from, to } = last30Days(new Date());
    resync.mutate(
      { from, to },
      {
        onSuccess: (result) => setSummary(summarize(result)),
        onError: (err) => {
          // Defensively surface 422 CONNECTION_DISABLED / 404 / FEATURE_DISABLED
          // and any other ApiError; the gating already prevents most of these,
          // but a mid-session toggle could race.
          const message =
            err instanceof ApiError ? err.message : 'Could not sync this account. Try again.';
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
              aria-label="Sync now"
              disabled={resync.isPending}
              onClick={onClick}
              className="h-9 w-9"
            >
              <RefreshCw className={cn('h-5 w-5', resync.isPending && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sync now</TooltipContent>
        </Tooltip>
      </TooltipProvider>

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

function DismissButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute right-2 top-2 rounded-sm opacity-70 transition-opacity hover:opacity-100"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
