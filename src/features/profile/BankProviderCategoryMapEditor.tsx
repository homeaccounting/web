import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import type { DictionaryEntryResponse, UpdateBankingRequest, UUID } from '@/api/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/lib/toast';
import { useUpdateBanking } from '@/features/configuration/useUpdateBanking';
import {
  parseBankProviderCategoryKey,
  bankProviderCategoryRowSchema,
  renderBankProviderCategoryKey,
} from './bankConnectionSchema';

type Kind = 'mcc' | 'label' | 'counterparty';

interface Row {
  kind: Kind;
  value: string;
  categoryId: string;
}

// The kinds each direction can carry (spec §6). Expenses may carry a merchant
// MCC, a provider label, or a counterparty token; income never carries an
// MCC/label, so it offers only the counterparty signal. The first entry is the
// default for a freshly-added row.
const KINDS_BY_DIRECTION: Record<'income' | 'expense', readonly Kind[]> = {
  expense: ['mcc', 'label', 'counterparty'],
  income: ['counterparty'],
};

interface BankProviderCategoryMapEditorProps {
  // Whether this editor edits the income or the expense provider-category map.
  // Drives which kinds are offered, which categories the dropdown lists, and
  // which UpdateBankingRequest field is PUT.
  direction: 'income' | 'expense';
  // The bank-provider category → category map for this direction. Keys are
  // tagged strings (`"mcc:0742"` / `"label:eating_out"` / `"counterparty:…"`);
  // see BankingConfigurationDTO.
  value: Record<string, UUID>;
  // The dictionary categories for this direction (income vs expense). Scoping
  // the dropdown per direction makes a wrong-direction mapping unrepresentable.
  categories: DictionaryEntryResponse[];
}

// Editor for a bank-provider category → category map (tracker#51/#52/#55). One
// instance edits the expense map (MCC | Label | Counterparty), another the
// income map (Counterparty only — income carries no merchant signal). A key is
// an ISO-18245 MCC (numeric; a global namespace shared across MCC providers), a
// bank provider's own label (free text; provider-specific), or a universal
// counterparty token (EDRPOU/IBAN). Seeded label rows make known labels
// re-pointable without typing — just change the category dropdown.
export function BankProviderCategoryMapEditor({
  direction,
  value,
  categories,
}: BankProviderCategoryMapEditorProps) {
  const { t } = useTranslation('profile');
  const update = useUpdateBanking();
  const kinds = KINDS_BY_DIRECTION[direction];
  const defaultKind = kinds[0] as Kind;
  const showKindSelect = kinds.length > 1;
  const kindLabelFor = (k: Kind) => t(`categoryEditor.kind.${k}`);
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(value).map(([key, categoryId]) => {
      const parsed = parseBankProviderCategoryKey(key) ?? { kind: 'label' as const, value: key };
      return { kind: parsed.kind, value: parsed.value, categoryId };
    }),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((prev) => [...prev, { kind: defaultKind, value: '', categoryId: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const save = () => {
    setValidationError(null);
    const map: Record<string, UUID> = {};
    for (const row of rows) {
      const parsed = bankProviderCategoryRowSchema.safeParse(row);
      if (!parsed.success) {
        setValidationError(parsed.error.issues[0]?.message ?? t('mapEditor.invalidMapping'));
        return;
      }
      const key = renderBankProviderCategoryKey(parsed.data);
      if (map[key] !== undefined) {
        setValidationError(t('mapEditor.duplicateMapping', { key }));
        return;
      }
      map[key] = parsed.data.categoryId;
    }
    const body: UpdateBankingRequest =
      direction === 'income' ? { incomeCategoryMap: map } : { expenseCategoryMap: map };
    update.mutate(body, { onSuccess: () => toast.success(t('updated')) });
  };

  const opError = validationError ?? update.error?.message ?? null;

  return (
    <section
      className="space-y-3"
      aria-labelledby={`bank-provider-${direction}-category-mapping-heading`}
    >
      <h3 id={`bank-provider-${direction}-category-mapping-heading`} className="sr-only">
        {t(`categoryEditor.heading.${direction}`)}
      </h3>
      {rows.length === 0 && <EmptyState message={t('mapEditor.noMappings')} className="p-0" />}
      <ul className="space-y-2">
        {rows.map((row, index) => {
          const kindLabel = t('categoryEditor.kindLabel', { row: index + 1 });
          const valueLabel = t(`categoryEditor.valueLabel.${row.kind}`, { row: index + 1 });
          const categoryLabel = t(`categoryEditor.categoryLabelRow.${direction}`, {
            row: index + 1,
          });
          return (
            <li key={index} className="flex items-center gap-2">
              {showKindSelect ? (
                <Select value={row.kind} onValueChange={(v) => setRow(index, { kind: v as Kind })}>
                  <SelectTrigger className="w-32" aria-label={kindLabel}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((k) => (
                      <SelectItem key={k} value={k}>
                        {kindLabelFor(k)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                // Single signal for this direction (income → counterparty): a
                // static badge instead of a one-option dropdown.
                <Badge variant="muted" className="w-32 justify-center py-1.5">
                  {kindLabelFor(defaultKind)}
                </Badge>
              )}
              {row.kind === 'mcc' ? (
                <Input
                  value={row.value}
                  onChange={(e) => setRow(index, { value: e.target.value })}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder={t('categoryEditor.mccPlaceholder')}
                  className="w-28"
                  aria-label={valueLabel}
                />
              ) : (
                <Input
                  value={row.value}
                  onChange={(e) => setRow(index, { value: e.target.value })}
                  placeholder={
                    row.kind === 'counterparty'
                      ? t('categoryEditor.counterpartyPlaceholder')
                      : t('categoryEditor.labelPlaceholder')
                  }
                  className="flex-1"
                  aria-label={valueLabel}
                />
              )}
              <Select
                value={row.categoryId || undefined}
                onValueChange={(v) => setRow(index, { categoryId: v })}
              >
                <SelectTrigger className="flex-1" aria-label={categoryLabel}>
                  <SelectValue placeholder={t(`categoryEditor.categoryPlaceholder.${direction}`)} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('mapEditor.removeMapping', {
                  label: row.value || t('mapEditor.rowFallback', { row: index + 1 }),
                })}
                onClick={() => removeRow(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" />
          {t('mapEditor.addMapping')}
        </Button>
        <Button
          size="sm"
          onClick={save}
          disabled={update.isPending}
          aria-label={t('mapEditor.saveMapping')}
        >
          {update.isPending ? t('saving') : t('mapEditor.saveMapping')}
        </Button>
      </div>
      {opError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(opError)}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
