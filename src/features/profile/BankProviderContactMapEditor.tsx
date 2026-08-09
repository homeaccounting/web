import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { DictionaryEntryResponse, DictionaryResponse, UUID } from '@/api/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/lib/toast';
import { useUpdateBanking } from '@/features/configuration/useUpdateBanking';
import { useCreateDictionaryEntry } from '@/features/configuration/useCreateDictionaryEntry';
import { ContactCombobox } from '@/features/transactions/ContactCombobox';
import { bankProviderContactRowSchema } from './bankConnectionSchema';

interface Row {
  token: string;
  contactId: string;
}

interface BankProviderContactMapEditorProps {
  // Provider-token → contact map. Keys are bare trimmed tokens (see
  // BankingConfigurationDTO.contactMap).
  value: Record<string, UUID>;
  contacts: DictionaryEntryResponse[]; // flattened, for the combobox options
  contactDict?: DictionaryResponse; // raw tree, for full-path create parity
}

// Editor for the provider-token → contact map (tracker#54). Simpler sibling of
// BankProviderCategoryMapEditor: a key is one bare token (no mcc/label
// tag), a value is a contact dictionary entry, and the map starts empty (no
// seed). The contact picker is a creatable ContactCombobox — a new contact can
// be added inline.
export function BankProviderContactMapEditor({
  value,
  contacts,
  contactDict,
}: BankProviderContactMapEditorProps) {
  const update = useUpdateBanking();
  const createContact = useCreateDictionaryEntry();
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(value).map(([token, contactId]) => ({ token, contactId })),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, { token: '', contactId: '' }]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  const createAndSelect = async (index: number, name: string) => {
    try {
      const r = await createContact.mutateAsync({ dictId: 'contact', name, dict: contactDict });
      setRow(index, { contactId: r.id });
    } catch {
      setValidationError('Could not create contact.');
    }
  };

  const save = () => {
    setValidationError(null);
    const map: Record<string, UUID> = {};
    for (const row of rows) {
      const parsed = bankProviderContactRowSchema.safeParse(row);
      if (!parsed.success) {
        setValidationError(parsed.error.issues[0]?.message ?? 'Invalid mapping');
        return;
      }
      if (map[parsed.data.token] !== undefined) {
        setValidationError(`Duplicate mapping: ${parsed.data.token}`);
        return;
      }
      map[parsed.data.token] = parsed.data.contactId;
    }
    update.mutate({ contactMap: map }, { onSuccess: () => toast.success('Updated.') });
  };

  const opError = validationError ?? update.error?.message ?? null;

  return (
    <section className="space-y-3" aria-labelledby="bank-provider-contact-mapping-heading">
      <h3 id="bank-provider-contact-mapping-heading" className="sr-only">
        Bank provider token to contact mapping
      </h3>
      <p className="text-xs text-muted-foreground">Mappings apply to future imports.</p>
      {rows.length === 0 && <EmptyState message="No mappings yet." className="p-0" />}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={index} className="flex items-center gap-2">
            <Input
              value={row.token}
              onChange={(e) => setRow(index, { token: e.target.value })}
              placeholder="Provider counterparty token"
              className="flex-1 font-mono"
              aria-label={`Provider token, row ${index + 1}`}
            />
            <div className="flex-1">
              <ContactCombobox
                options={contacts}
                value={row.contactId || null}
                onChange={(id) => setRow(index, { contactId: id ?? '' })}
                onCreate={(name) => createAndSelect(index, name)}
                placeholder="Contact"
                aria-label={`Contact, row ${index + 1}`}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove mapping ${row.token || `row ${index + 1}`}`}
              onClick={() => removeRow(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-4 w-4" />
          Add mapping
        </Button>
        <Button size="sm" onClick={save} disabled={update.isPending} aria-label="Save mapping">
          {update.isPending ? 'Saving…' : 'Save mapping'}
        </Button>
      </div>
      {opError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{opError}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
