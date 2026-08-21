import { afterEach, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { accountFixture } from '@/test/fixtures';
import { buildAccountGroups, SHARED_GROUP } from './accountGroups';
import { roleLabel } from './roles';

// Regression: role labels and synthetic group headers must re-resolve on a
// LIVE i18next language switch (the app calls i18n.changeLanguage at runtime
// with no reload). Resolving these at module-load time froze them at 'en'.
function Probe() {
  useTranslation('accounts'); // subscribe so a language change re-renders
  const groups = buildAccountGroups([{ ...accountFixture, role: 'editor' }]);
  const shared = groups.find((g) => g.key === SHARED_GROUP.key);
  return (
    <div>
      <span data-testid="role">{roleLabel('editor')}</span>
      <span data-testid="group">{shared?.label}</span>
    </div>
  );
}

afterEach(async () => {
  await i18n.changeLanguage('en');
});

it('re-resolves role labels and group headers on live language switch', async () => {
  await i18n.changeLanguage('en');
  act(() => {
    render(<Probe />);
  });
  expect(screen.getByTestId('role')).toHaveTextContent('Editor');
  expect(screen.getByTestId('group')).toHaveTextContent('Shared with me');

  await act(async () => {
    await i18n.changeLanguage('uk');
  });
  expect(screen.getByTestId('role')).toHaveTextContent('Редактор');
  expect(screen.getByTestId('group')).toHaveTextContent('Надано мені');

  await act(async () => {
    await i18n.changeLanguage('en');
  });
  expect(screen.getByTestId('role')).toHaveTextContent('Editor');
  expect(screen.getByTestId('group')).toHaveTextContent('Shared with me');
});
