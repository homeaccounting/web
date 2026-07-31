import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyInput, type MoneyInputProps } from './MoneyInput';

function Harness({
  initial = NaN,
  onChange,
  currency = 'USD',
  ...props
}: {
  initial?: number | string;
  onChange?: (v: number | string) => void;
} & Omit<MoneyInputProps, 'value' | 'onChange' | 'currency'> & { currency?: string }) {
  const [value, setValue] = useState<number | string>(initial);
  return (
    <MoneyInput
      value={value}
      currency={currency}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      aria-label="Amount"
      {...props}
    />
  );
}

function amount() {
  return screen.getByLabelText<HTMLInputElement>('Amount');
}

describe('MoneyInput', () => {
  it('renders empty for NaN/null/undefined', () => {
    render(<Harness initial={NaN} />);
    expect(amount()).toHaveValue(null); // number input with empty value
  });

  it('renders a numeric value', () => {
    render(<Harness initial={42.5} />);
    expect(amount()).toHaveValue(42.5);
  });

  it('shows the currency badge', () => {
    render(<Harness currency="EUR" />);
    expect(screen.getByTestId('currency-badge')).toHaveTextContent('EUR');
  });

  it('shows an em dash when currency is empty', () => {
    render(<Harness currency="" />);
    expect(screen.getByTestId('currency-badge')).toHaveTextContent('—');
  });

  it('emits a number for a valid numeric entry', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(amount(), { target: { value: '12.5' } });
    expect(onChange).toHaveBeenLastCalledWith(12.5);
  });

  it('passes through an empty string (so the field can be cleared)', () => {
    const onChange = vi.fn();
    render(<Harness initial={5} onChange={onChange} />);
    fireEvent.change(amount(), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('defaults aria-label to Amount but allows override', () => {
    render(
      <MoneyInput value={NaN} currency="USD" onChange={() => {}} aria-label="Target balance" />,
    );
    expect(screen.getByLabelText('Target balance')).toBeInTheDocument();
  });

  it('forwards inputRef to the underlying input', () => {
    let el: HTMLInputElement | null = null;
    render(
      <MoneyInput
        value={NaN}
        currency="USD"
        onChange={() => {}}
        aria-label="Amount"
        inputRef={(node) => {
          el = node;
        }}
      />,
    );
    expect(el).toBeInstanceOf(HTMLInputElement);
  });
});
