import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AccountResponse,
  UUID,
  UpdateDefaultsRequest,
  AccountSubtypeKind,
  AccountSubtypeType,
} from '@/api/types';
import { ACCOUNT_SUBTYPE_TYPES } from '@/api/types';
import { subtypeTypeToKind, isSelectableDefaultAccount } from '@/api/defaults';
import { accountSubtypeLabel } from '@/features/accounts/labels';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/lib/toast';
import { useUpdateDefaults } from '@/features/configuration/useUpdateDefaults';
import { AccountPicker } from '@/features/accounts/AccountPicker';
import { canModify } from '@/features/accounts/roles';

const NONE_VALUE = '__none__';

interface Props {
  accounts: AccountResponse[];
  accountCurrent: UUID | null;
  subtypeCurrent: Partial<Record<AccountSubtypeKind, UUID>>;
}

export function DefaultAccountsCard({ accounts, accountCurrent, subtypeCurrent }: Props) {
  const { t } = useTranslation('profile');
  const update = useUpdateDefaults();
  // Defaults seed new transactions, so view-only accounts aren't offered.
  const selectable = accounts.filter((a) => isSelectableDefaultAccount(a) && canModify(a.role));

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
    update.mutate(body, { onSuccess: () => toast.success(t('updated')) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('defaults.accountsTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <label htmlFor="default-account" className="w-44 text-sm font-medium">
            {t('defaults.defaultAccount')}
          </label>
          <AccountPicker
            id="default-account"
            aria-label={t('defaults.defaultAccount')}
            className="w-56"
            accounts={selectable}
            value={account || null}
            placeholder={t('selectPlaceholder')}
            onChange={(id) => setAccount(id ?? '')}
          />
        </div>
        <div className="space-y-3 border-t pt-4">
          {ACCOUNT_SUBTYPE_TYPES.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <label htmlFor={`default-${k}`} className="w-44 text-sm font-medium">
                {t('defaults.subtypeDefaultAccount', { subtype: accountSubtypeLabel(k) })}
              </label>
              <AccountPicker
                id={`default-${k}`}
                aria-label={t('defaults.subtypeDefaultAccount', {
                  subtype: accountSubtypeLabel(k),
                })}
                className="w-56"
                accounts={selectable.filter((a) => a.subtype?.type === k)}
                value={rows[k] === NONE_VALUE ? null : rows[k]}
                noneLabel={t('defaults.none')}
                onChange={(id) => setRows((prev) => ({ ...prev, [k]: id ?? NONE_VALUE }))}
              />
            </div>
          ))}
        </div>
        <Button type="button" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? t('saving') : t('common:save')}
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
