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

type Slice = { category: string; amount: number };
interface HostValues {
  incomes: Slice[];
  expenses: Slice[];
}

function Host({
  sections,
  currency = 'USD',
  incomes = [],
  expenses = [],
}: {
  sections: AllocationSection[];
  currency?: string;
  incomes?: Slice[];
  expenses?: Slice[];
}) {
  const form = useForm<HostValues>({ defaultValues: { incomes, expenses } });
  return (
    <FormProvider {...form}>
      <AllocationsEditor sections={sections} currency={currency} />
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
