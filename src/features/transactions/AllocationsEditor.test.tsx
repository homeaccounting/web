import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import type { DictionaryEntryResponse } from '@/api/types';
import { formatMoney } from '@/lib/format';
import { AllocationsEditor, type AllocationSection } from './AllocationsEditor';

const C1 = '00000000-0000-0000-0000-000000000001';
const C2 = '00000000-0000-0000-0000-000000000002';

const incomeCategories: DictionaryEntryResponse[] = [
  { id: C1, name: 'Salary' },
  { id: C2, name: 'Bonus' },
];
const expenseCategories: DictionaryEntryResponse[] = [
  { id: C1, name: 'Food' },
  { id: C2, name: 'Rent' },
];

type Slice = { category: string; amount: number; comment?: string };
interface HostValues {
  incomes: Slice[];
  expenses: Slice[];
  targetMode?: boolean;
  targetTotal?: number | '';
}

function Host({
  sections,
  currency = 'USD',
  incomes = [],
  expenses = [],
  targetMode = false,
  targetTotal = '',
  lockTarget,
}: {
  sections: AllocationSection[];
  currency?: string;
  incomes?: Slice[];
  expenses?: Slice[];
  targetMode?: boolean;
  targetTotal?: number | '';
  lockTarget?: boolean;
}) {
  const form = useForm<HostValues>({
    defaultValues: { incomes, expenses, targetMode, targetTotal },
  });
  return (
    <FormProvider {...form}>
      <AllocationsEditor sections={sections} currency={currency} lockTarget={lockTarget} />
    </FormProvider>
  );
}

const expenseSection: AllocationSection = {
  name: 'expenses',
  title: 'Expenses',
  addLabel: '+ Add expense category',
  categories: expenseCategories,
};
const incomeSection: AllocationSection = {
  name: 'incomes',
  title: 'Income',
  addLabel: '+ Add income category',
  categories: incomeCategories,
};

describe('AllocationsEditor', () => {
  it('renders one row per slice in a section', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[
          { category: C1, amount: 100 },
          { category: C2, amount: 200 },
        ]}
      />,
    );
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
  });

  it('renders a comment input per row seeded from form values', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 5, comment: 'milk' }]}
      />,
    );
    expect(screen.getByLabelText('Comment')).toHaveValue('milk');
  });

  it('appends a blank-comment row when Add is clicked', () => {
    render(<Host sections={[expenseSection]} expenses={[]} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add expense category' }));
    expect(screen.getByLabelText('Comment')).toHaveValue('');
  });

  it('appends a row when the section Add button is clicked', () => {
    render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 100 }]} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /add expense category/i }));
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
  });

  it('removes a row when its Remove button is clicked', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[
          { category: C1, amount: 100 },
          { category: C2, amount: 200 },
        ]}
      />,
    );
    expect(screen.getAllByRole('combobox')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!);
    expect(screen.getAllByRole('combobox')).toHaveLength(1);
  });

  it('shows the total across all sections with the currency', () => {
    render(
      <Host
        sections={[incomeSection, expenseSection]}
        currency="USD"
        incomes={[{ category: C1, amount: 5000 }]}
        expenses={[{ category: C1, amount: 500 }]}
      />,
    );
    const total = screen.getByTestId('allocations-total');
    expect(total).toHaveTextContent(formatMoney(5500, 'USD'));
    expect(total).toHaveTextContent('5,500');
  });

  it('collapsible section is collapsed by default and expands on heading click', () => {
    render(
      <Host
        sections={[{ ...incomeSection, collapsible: true }]}
        incomes={[{ category: C1, amount: 5000 }]}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add income category/i })).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /income/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add income category/i })).toBeInTheDocument();
  });

  it('ignores non-finite amounts in the total', () => {
    render(
      <Host
        sections={[expenseSection]}
        currency="USD"
        expenses={[
          { category: C1, amount: 100 },
          { category: C2, amount: NaN },
        ]}
      />,
    );
    expect(screen.getByTestId('allocations-total')).toHaveTextContent(formatMoney(100, 'USD'));
  });
});

describe('target total mode', () => {
  it('is off by default: no target input, no diff, plain total shown', () => {
    render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 100 }]} />);
    expect(screen.queryByLabelText('Target total')).not.toBeInTheDocument();
    expect(screen.queryByTestId('allocations-diff')).not.toBeInTheDocument();
    expect(screen.getByTestId('allocations-total')).toHaveTextContent(formatMoney(100, 'USD'));
  });

  it('reveals the target input when the toggle is switched on', () => {
    render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 100 }]} />);
    fireEvent.click(screen.getByLabelText('Target'));
    expect(screen.getByLabelText('Target total')).toBeInTheDocument();
  });

  it('seeds the target with the current total when the toggle is switched on', () => {
    render(
      <Host
        sections={[incomeSection, expenseSection]}
        incomes={[{ category: C1, amount: 5000 }]}
        expenses={[{ category: C1, amount: 500 }]}
      />,
    );
    fireEvent.click(screen.getByLabelText('Target'));
    // Prefills with the current allocations sum (5000 + 500) rather than blank,
    // so editing starts from the existing total.
    expect(screen.getByLabelText('Target total')).toHaveValue(5500);
  });

  it('keeps the toggle and total on one compact row when target is off', () => {
    render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 100 }]} />);
    const toggle = screen.getByLabelText('Target');
    const total = screen.getByTestId('allocations-total');
    // Both share the toggle's row (toggle left, total right) — no stacked, half-empty card.
    expect(toggle.closest('div')).toContainElement(total);
  });

  // The readout is a progress bar (fills sum/target) plus a short colored caption
  // giving the exact remaining. Color signals the under/over/balanced state.
  it('shows a partial bar and a muted "left" caption when under', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 55 }]}
        targetMode
        targetTotal={80}
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '55');
    expect(bar).toHaveAttribute('aria-valuemax', '80');
    const diff = screen.getByTestId('allocations-diff');
    expect(diff).toHaveTextContent(`${formatMoney(25, 'USD')} left`);
    expect(diff.className).toContain('text-muted-foreground');
  });

  it('shows a destructive "over" caption when over target', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 90 }]}
        targetMode
        targetTotal={80}
      />,
    );
    const diff = screen.getByTestId('allocations-diff');
    // remaining = 80 - 90 = -10 → "$10.00 over".
    expect(diff).toHaveTextContent(`${formatMoney(10, 'USD')} over`);
    expect(diff.className).toContain('text-destructive');
  });

  it('shows a positive-token "Balanced" caption when exact', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 80 }]}
        targetMode
        targetTotal={80}
      />,
    );
    const diff = screen.getByTestId('allocations-diff');
    expect(diff).toHaveTextContent(/balanced/i);
    expect(diff.className).toContain('text-positive');
  });

  it('fills an empty row to the outstanding diff', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[
          { category: C1, amount: 55 },
          { category: C2, amount: NaN },
        ]}
        targetMode
        targetTotal={80}
      />,
    );
    const fill = screen.getByRole('button', { name: /fill/i });
    fireEvent.click(fill);
    const amounts = screen.getAllByRole('spinbutton');
    expect(amounts[1]).toHaveValue(25);
  });

  it('shows Fill only on the empty row while a blank row exists (fill blanks first)', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[
          { category: C1, amount: 55 },
          { category: C2, amount: NaN },
        ]}
        targetMode
        targetTotal={80}
      />,
    );
    // Only one Fill button (on the empty row 2), not one per row.
    expect(screen.getAllByRole('button', { name: /fill/i })).toHaveLength(1);
  });

  it('tops up a partial row so the total reaches the target', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[
          { category: C1, amount: 55 },
          { category: C2, amount: 10 },
        ]}
        targetMode
        targetTotal={80}
      />,
    );
    const fills = screen.getAllByRole('button', { name: /fill/i });
    fireEvent.click(fills[1]!);
    const amounts = screen.getAllByRole('spinbutton');
    expect(amounts[1]).toHaveValue(25);
  });

  it('hides Fill when already balanced', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 80 }]}
        targetMode
        targetTotal={80}
      />,
    );
    expect(screen.queryByRole('button', { name: /fill/i })).not.toBeInTheDocument();
  });

  it('does not render Fill when target mode is off', () => {
    render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 55 }]} />);
    expect(screen.queryByRole('button', { name: /fill/i })).not.toBeInTheDocument();
  });
});

describe('lockTarget', () => {
  it('hides the Target toggle and shows the target as read-only text', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 55 }]}
        targetMode
        targetTotal={80}
        lockTarget
      />,
    );
    // The toggle checkbox is not rendered.
    expect(screen.queryByLabelText('Target')).not.toBeInTheDocument();
    // The editable target input is not rendered either.
    expect(screen.queryByLabelText('Target total')).not.toBeInTheDocument();
    // The target amount is shown as static read-only text.
    expect(screen.getByTestId('allocations-target-readout')).toHaveTextContent(
      formatMoney(80, 'USD'),
    );
    // The diff/remaining readout still works (target still seeded in form state).
    const diff = screen.getByTestId('allocations-diff');
    expect(diff).toHaveTextContent(`${formatMoney(25, 'USD')} left`);
  });
});
