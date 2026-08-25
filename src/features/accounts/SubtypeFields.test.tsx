import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { SubtypeFields } from './SubtypeFields';
import type { CreateAccountFormValues } from './schema';

const apiBase = 'http://localhost:8080';

// Minimal RHF harness: mounts SubtypeFields inside a real form so
// useFormContext() resolves, and surfaces the live watched bankName value
// via a plain text node (avoids needing a submit round-trip to assert
// intermediate typing/selection state).
function Harness({ bankName }: { bankName?: string }) {
  const form = useForm<CreateAccountFormValues>({
    defaultValues: {
      name: '',
      currency: 'USD',
      initialBalance: 0,
      subtype: {
        type: 'bankAccount',
        bankName,
        accountNumber: undefined,
        cardNetwork: undefined,
      },
    },
  });
  const watchedBankName = form.watch('subtype.bankName');
  return (
    <FormProvider {...form}>
      <form>
        <SubtypeFields />
        <div data-testid="bank-name-value">{watchedBankName ?? ''}</div>
      </form>
    </FormProvider>
  );
}

function ui(bankName?: string) {
  return (
    <AuthProvider>
      <Harness bankName={bankName} />
    </AuthProvider>
  );
}

// Asset counterpart of Harness: mounts SubtypeFields for an asset account and
// surfaces the live watched assetType so selection/typing can be asserted.
function AssetHarness({ assetType }: { assetType?: string }) {
  const form = useForm<CreateAccountFormValues>({
    defaultValues: {
      name: '',
      currency: 'USD',
      initialBalance: 0,
      subtype: { type: 'asset', assetType },
    },
  });
  const watchedAssetType = form.watch('subtype.assetType');
  return (
    <FormProvider {...form}>
      <form>
        <SubtypeFields />
        <div data-testid="asset-type-value">{watchedAssetType ?? ''}</div>
      </form>
    </FormProvider>
  );
}

function assetUi(assetType?: string) {
  return (
    <AuthProvider>
      <AssetHarness assetType={assetType} />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('SubtypeFields — bank account bankName provider select', () => {
  it('selecting a provider from the Select sets bankName to its displayName', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui());
    await user.click(await screen.findByRole('combobox', { name: /bank name/i }));
    await user.click(await screen.findByRole('option', { name: /^monobank$/i }));
    expect(screen.getByTestId('bank-name-value')).toHaveTextContent('Monobank');
  });

  it('selecting "Other…" reveals a text input; typing sets bankName to the typed value', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui());
    await user.click(await screen.findByRole('combobox', { name: /bank name/i }));
    await user.click(await screen.findByRole('option', { name: /other/i }));
    const customInput = await screen.findByLabelText(/custom bank name/i);
    await user.type(customInput, 'My Local Bank');
    expect(screen.getByTestId('bank-name-value')).toHaveTextContent('My Local Bank');
  });

  it('editing an account whose bankName is not a known provider opens in custom mode, prefilled', async () => {
    renderWithProviders(ui('Some Credit Union'));
    const customInput = await screen.findByLabelText(/custom bank name/i);
    expect(customInput).toHaveValue('Some Credit Union');
  });

  it('editing an account whose bankName matches a known provider shows it selected, no custom input', async () => {
    renderWithProviders(ui('Monobank'));
    expect(await screen.findByRole('combobox', { name: /bank name/i })).toHaveTextContent(
      'Monobank',
    );
    expect(screen.queryByLabelText(/custom bank name/i)).not.toBeInTheDocument();
  });

  it('falls back to a plain text input when providers are unavailable', async () => {
    server.use(
      http.get(
        `${apiBase}/api/users/me/configuration/banking/providers`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderWithProviders(ui('Whatever Bank'));
    await waitFor(() => {
      expect(screen.queryByRole('combobox', { name: /bank name/i })).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText(/bank name/i)).toHaveValue('Whatever Bank');
  });

  it('editing an unknown bankName and clearing the custom input keeps the custom Input visible', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui('Some Credit Union'));
    const customInput = await screen.findByLabelText(/custom bank name/i);
    expect(customInput).toHaveValue('Some Credit Union');

    await user.clear(customInput);

    expect(await screen.findByLabelText(/custom bank name/i)).toHaveValue('');
    expect(screen.getByTestId('bank-name-value')).toHaveTextContent('');
  });

  it('switching from custom entry to a real provider removes the custom Input and adopts its displayName', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui());
    await user.click(await screen.findByRole('combobox', { name: /bank name/i }));
    await user.click(await screen.findByRole('option', { name: /other/i }));
    const customInput = await screen.findByLabelText(/custom bank name/i);
    await user.type(customInput, 'My Local Bank');
    expect(screen.getByTestId('bank-name-value')).toHaveTextContent('My Local Bank');

    await user.click(screen.getByRole('combobox', { name: /bank name/i }));
    await user.click(await screen.findByRole('option', { name: /^monobank$/i }));

    expect(screen.queryByLabelText(/custom bank name/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('bank-name-value')).toHaveTextContent('Monobank');
  });

  it('renders a flat list with no "Other countries" group when all providers are in-country', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui());
    await user.click(await screen.findByRole('combobox', { name: /bank name/i }));
    await screen.findByRole('option', { name: /^monobank$/i });
    expect(screen.queryByText('Other countries')).not.toBeInTheDocument();
  });

  it('groups out-of-country providers under an "Other countries" label and keeps "Other…" last', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/users/me/configuration/banking/providers`, () =>
        HttpResponse.json([
          {
            id: 'monobank',
            displayName: 'Monobank',
            supportsPull: true,
            supportsFile: false,
            countries: ['UA'],
            inUserCountry: true,
          },
          {
            id: 'chase',
            displayName: 'Chase',
            supportsPull: true,
            supportsFile: false,
            countries: ['US'],
            inUserCountry: false,
          },
        ]),
      ),
    );
    renderWithProviders(ui());
    await user.click(await screen.findByRole('combobox', { name: /bank name/i }));
    expect(await screen.findByText('Other countries')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /united states/i })).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]).toHaveTextContent('Other…');
  });

  it('resolves to the matching provider once a delayed providers response arrives for a pre-filled known value', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration/banking/providers`, async () => {
        await delay(50);
        return HttpResponse.json([
          { id: 'monobank', displayName: 'Monobank', supportsPull: true, supportsFile: false },
          { id: 'privatbank', displayName: 'PrivatBank', supportsPull: false, supportsFile: true },
        ]);
      }),
    );
    renderWithProviders(ui('Monobank'));

    // While providers are still loading, the field fails soft to a plain input.
    expect(screen.getByLabelText(/bank name/i)).toHaveValue('Monobank');

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /bank name/i })).toHaveTextContent('Monobank');
    });
    expect(screen.queryByLabelText(/custom bank name/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('bank-name-value')).toHaveTextContent('Monobank');
  });
});

describe('SubtypeFields — asset assetType select', () => {
  it('selecting a named category from the Select sets assetType to its enum value', async () => {
    const user = userEvent.setup();
    renderWithProviders(assetUi());
    await user.click(await screen.findByRole('combobox', { name: /asset type/i }));
    await user.click(await screen.findByRole('option', { name: /^electronics$/i }));
    expect(screen.getByTestId('asset-type-value')).toHaveTextContent('electronics');
  });

  it('selecting "Other…" reveals a text input; typing sets assetType to the typed value', async () => {
    const user = userEvent.setup();
    renderWithProviders(assetUi());
    await user.click(await screen.findByRole('combobox', { name: /asset type/i }));
    await user.click(await screen.findByRole('option', { name: /other/i }));
    const customInput = await screen.findByLabelText(/custom asset type/i);
    await user.type(customInput, 'Piano');
    expect(screen.getByTestId('asset-type-value')).toHaveTextContent('Piano');
  });

  it('editing an account whose assetType is a freeform value opens in custom mode, prefilled', async () => {
    renderWithProviders(assetUi('antique clock'));
    const customInput = await screen.findByLabelText(/custom asset type/i);
    expect(customInput).toHaveValue('antique clock');
  });

  it('editing an account whose assetType is a known category shows it selected, no custom input', async () => {
    renderWithProviders(assetUi('furniture'));
    expect(await screen.findByRole('combobox', { name: /asset type/i })).toHaveTextContent(
      'Furniture',
    );
    expect(screen.queryByLabelText(/custom asset type/i)).not.toBeInTheDocument();
  });

  it('switching from custom entry back to a named category removes the custom Input', async () => {
    const user = userEvent.setup();
    renderWithProviders(assetUi());
    await user.click(await screen.findByRole('combobox', { name: /asset type/i }));
    await user.click(await screen.findByRole('option', { name: /other/i }));
    const customInput = await screen.findByLabelText(/custom asset type/i);
    await user.type(customInput, 'Piano');
    expect(screen.getByTestId('asset-type-value')).toHaveTextContent('Piano');

    await user.click(screen.getByRole('combobox', { name: /asset type/i }));
    await user.click(await screen.findByRole('option', { name: /^equipment$/i }));

    expect(screen.queryByLabelText(/custom asset type/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('asset-type-value')).toHaveTextContent('equipment');
  });
});
