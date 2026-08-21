import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/api/client';
import i18n from '@/lib/i18n';
import { toast } from '@/lib/toast';
import type { PromptFailure, UUID } from '@/api/types';
import { usePrompt } from './usePrompt';

export interface QuickAddPromptProps {
  accountId: UUID;
  accountName?: string;
}

// Content of the destructive alert after a submit that produced something to
// fix. `null` means no alert. `failures` is empty for a plain API error
// (message only) and non-empty for per-transaction report-bad outcomes.
interface AlertState {
  title?: string;
  message?: string;
  failures: PromptFailure[];
}

// Map a thrown error to fixed copy by HTTP status, matching the backend's
// 503 (disabled) / 502 (upstream) mapping in Web/API/PromptAPI.hs. 400 shows the
// domain message; anything else (500, other statuses, network reject, unknown)
// falls through to the shared generic copy used by the create/edit dialogs.
// NOTE: 400 must be special-cased explicitly — do NOT `return error.message` for
// all remaining statuses, or a 500 would leak its raw message instead of the
// generic copy (and fail the "unexpected status" test).
function errorAlert(error: unknown): AlertState {
  if (error instanceof ApiError) {
    if (error.status === 503)
      return { message: i18n.t('transactions:bulk.quickAddUnavailable'), failures: [] };
    if (error.status === 502)
      return { message: i18n.t('transactions:bulk.quickAddUpstream'), failures: [] };
    if (error.status === 400) return { message: error.message, failures: [] };
  }
  return { message: i18n.t('transactions:bulk.genericError'), failures: [] };
}

export function QuickAddPrompt({ accountId, accountName }: QuickAddPromptProps) {
  const { t } = useTranslation('transactions');
  const [text, setText] = useState('');
  const [alert, setAlert] = useState<AlertState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prompt = usePrompt();

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || prompt.isPending) return;
    setAlert(null);
    try {
      const res = await prompt.mutateAsync({ text: trimmed, account: accountId });
      const okCount = res.succeeded.length;
      const failCount = res.failed.length;
      const okMsg = t('bulk.added', { count: okCount });
      if (failCount === 0) {
        // Full success: toast, clear, refocus.
        toast.success(okMsg);
        setText('');
        inputRef.current?.focus();
      } else if (okCount > 0) {
        // Partial: toast the good part, clear the box (no-dedup safety), alert the rest.
        toast.success(okMsg);
        setText('');
        setAlert({
          title: t('bulk.couldntRecordN', { failed: failCount, total: okCount + failCount }),
          failures: res.failed,
        });
      } else {
        // Total failure: keep the text editable, alert the reasons.
        setAlert({ title: t('bulk.couldntRecordThat'), failures: res.failed });
      }
    } catch (e) {
      // Errors keep the text so the user can adjust and retry.
      setAlert(errorAlert(e));
    }
  };

  return (
    <div data-testid="quick-add" className="sticky bottom-0 mt-auto border-t bg-background">
      {/* `Alert` sets role="alert" internally; we repeat it here for convention/
          consistency with the app's ~40 other destructive-Alert call sites. */}
      {alert && (
        <Alert
          role="alert"
          variant="destructive"
          // flush with the sticky bar's edges; pr-10 leaves room for the dismiss ✕
          className="relative rounded-none border-x-0 border-b-0 pr-10"
        >
          <button
            type="button"
            aria-label={t('bulk.dismiss')}
            className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            onClick={() => setAlert(null)}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          {alert.title && <AlertTitle>{alert.title}</AlertTitle>}
          <AlertDescription>
            {alert.message}
            {alert.failures.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {alert.failures.map((f) => (
                  <li key={f.index}>{t('bulk.item', { n: f.index + 1, reason: f.reason })}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      <form
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={prompt.isPending}
          aria-label={t('bulk.quickAddAria')}
          placeholder={
            accountName
              ? t('bulk.quickAddPlaceholderNamed', { name: accountName })
              : t('bulk.quickAddPlaceholder')
          }
        />
        <Button type="submit" disabled={prompt.isPending || text.trim() === ''}>
          {prompt.isPending ? t('bulk.adding') : t('bulk.add')}
        </Button>
      </form>
    </div>
  );
}
