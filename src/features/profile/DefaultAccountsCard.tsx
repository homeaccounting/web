import { useState } from 'react';
import type {
  AccountResponse,
  UUID,
  UpdateDefaultsRequest,
  AccountSubtypeKind,
  AccountSubtypeType,
} from '@/api/types';
import { ACCOUNT_SUBTYPE_TYPES } from '@/api/types';
import { subtypeTypeToKind, isSelectableDefaultAccount } from '@/api/defaults';
import { ACCOUNT_SUBTYPE_LABELS } from '@/features/accounts/labels';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/lib/toast';
import { useUpdateDefaults } from '@/features/configuration/useUpdateDefaults';
import { AccountSelect, NONE_VALUE } from './AccountSelect';

interface Props {
  accounts: AccountResponse[];
  accountCurrent: UUID | null;
  subtypeCurrent: Partial<Record<AccountSubtypeKind, UUID>>;
}

export function DefaultAccountsCard({ accounts, accountCurrent, subtypeCurrent }: Props) {
  const update = useUpdateDefaults();
  const selectable = accounts.filter(isSelectableDefaultAccount);

  const initialRows = Object.fromEntries(
    ACCOUNT_SUBTYPE_TYPES.map((k) => [k, subtypeCurrent[subtypeTypeToKind(k)] ?? NONE_VALUE]),
  ) as Record<AccountSubtypeType, string>;

  const [account, setAccount] = useState<string>(accountCurrent ?? '');
  const [rows, setRows] = useState<Record<AccountSubtypeType, string>>(initialRows);

  const dirty =
    account !== (accountCurrent ?? '') ||
    ACCOUNT_SUBTYPE_TYPES.some((k) => rows[k] !== initialRows[k]);

  const save = () => {
    const subtypeAccounts: Partial<Record<AccountSubtypeKind, UUID>> = {};
    for (const k of ACCOUNT_SUBTYPE_TYPES) {
      const v = rows[k];
      if (v && v !== NONE_VALUE) subtypeAccounts[subtypeTypeToKind(k)] = v;
    }
    const body: UpdateDefaultsRequest = { subtypeAccounts };
    if (account && account !== accountCurrent) body.account = account;
    update.mutate(body, { onSuccess: () => toast.success('Updated.') });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <label htmlFor="default-account" className="w-44 text-sm font-medium">
            Default account
          </label>
          <AccountSelect
            id="default-account"
            label="Default account"
            value={account}
            accounts={selectable}
            includeNone={false}
            onChange={setAccount}
          />
        </div>
        <div className="space-y-3 border-t pt-4">
          {ACCOUNT_SUBTYPE_TYPES.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <label htmlFor={`default-${k}`} className="w-44 text-sm font-medium">
                {ACCOUNT_SUBTYPE_LABELS[k]} default account
              </label>
              <AccountSelect
                id={`default-${k}`}
                label={`${ACCOUNT_SUBTYPE_LABELS[k]} default account`}
                value={rows[k]}
                includeNone
                accounts={selectable.filter((a) => a.subtype?.type === k)}
                onChange={(v) => setRows((prev) => ({ ...prev, [k]: v }))}
              />
            </div>
          ))}
        </div>
        <Button type="button" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        {update.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{update.error.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
