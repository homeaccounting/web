import { Link2, Merge, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface SelectionActionBarProps {
  count: number;
  // Exactly 2 rows selected and both are linkable (Completed). Gated upstream.
  canLink: boolean;
  // >= 2 rows selected AND the selection is merge-eligible.
  canMerge: boolean;
  // When >= 2 are selected but not merge-eligible, the reason to show on the
  // disabled Merge button's tooltip.
  mergeDisabledReason?: string;
  onLink: () => void;
  onMerge: () => void;
  onClear: () => void;
}

// A floating bar that appears when rows are selected, exposing the bulk actions
// (Link / Merge). It replaces the old per-row context-menu entry points so the
// user acts on the rows they already picked in the list rather than re-finding
// them inside a dialog. Purely presentational: all eligibility is computed by
// the pane and passed in.
export function SelectionActionBar({
  count,
  canLink,
  canMerge,
  mergeDisabledReason,
  onLink,
  onMerge,
  onClear,
}: SelectionActionBarProps) {
  const { t } = useTranslation('transactions');
  if (count === 0) return null;
  const showMerge = count >= 2;
  return (
    <div
      role="region"
      aria-label={t('list.selectionActions')}
      className="fixed inset-x-0 bottom-6 z-40 mx-auto flex w-fit items-center gap-3 rounded-xl bg-foreground px-3 py-2 pl-4 text-sm text-background shadow-lg"
    >
      <span className="font-medium tabular-nums">{t('list.selected', { count })}</span>

      {count === 1 && <span className="text-background/70">{t('list.selectHint')}</span>}

      {canLink && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onLink}
          className="h-8"
          aria-label={t('list.linkAria')}
        >
          <Link2 className="mr-1.5 h-4 w-4" aria-hidden />
          {t('list.link')}
        </Button>
      )}

      {showMerge && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* A disabled button swallows pointer events, so the tooltip needs a
                  wrapping span to receive hover when Merge is not eligible. */}
              <span tabIndex={canMerge ? undefined : 0}>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onMerge}
                  disabled={!canMerge}
                  className="h-8"
                  aria-label={t('list.mergeAria')}
                >
                  <Merge className="mr-1.5 h-4 w-4" aria-hidden />
                  {t('list.merge')}
                </Button>
              </span>
            </TooltipTrigger>
            {!canMerge && mergeDisabledReason && (
              <TooltipContent>{mergeDisabledReason}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}

      <Button
        size="icon"
        variant="ghost"
        onClick={onClear}
        aria-label={t('list.clearSelection')}
        className="h-8 w-8 text-background hover:bg-background/15 hover:text-background"
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
