import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker, type DatePickerProps } from './DatePicker';

// A controlled harness so tests observe both what the picker emits (onChange)
// and how it re-renders the committed value.
function Harness({
  initial = '',
  onChange,
  ...props
}: { initial?: string; onChange?: (v: string) => void } & Omit<
  DatePickerProps,
  'value' | 'onChange'
>) {
  const [value, setValue] = useState(initial);
  return (
    <DatePicker
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      aria-label="Date"
      {...props}
    />
  );
}

function dateInput() {
  return screen.getByLabelText('Date');
}

describe('DatePicker text entry', () => {
  it('renders the committed date-only value as text', () => {
    render(<Harness initial="2026-07-15" />);
    expect(dateInput()).toHaveValue('2026-07-15');
  });

  it('renders a withTime value as "yyyy-MM-dd HH:mm"', () => {
    render(<Harness initial="2026-07-15T14:30" withTime />);
    expect(dateInput()).toHaveValue('2026-07-15 14:30');
  });

  it('commits a typed date-only value on blur', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const input = dateInput();
    await userEvent.type(input, '2026-03-09');
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith('2026-03-09');
    expect(dateInput()).toHaveValue('2026-03-09');
  });

  it('commits a typed datetime on blur (emits ISO-ish yyyy-MM-ddTHH:mm)', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} withTime />);
    await userEvent.type(dateInput(), '2026-03-09 08:15');
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith('2026-03-09T08:15');
  });

  it('commits on Enter', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(dateInput(), '2026-03-09{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('2026-03-09');
  });

  it('reverts invalid text on blur without emitting garbage', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-07-15" onChange={onChange} />);
    const input = dateInput();
    await userEvent.clear(input);
    await userEvent.type(input, 'not-a-date');
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalledWith('not-a-date');
    // reverts to the last committed value
    expect(dateInput()).toHaveValue('2026-07-15');
  });

  it('rejects a day after maxDate and reverts', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-07-15" maxDate="2026-07-20" onChange={onChange} />);
    const input = dateInput();
    await userEvent.clear(input);
    await userEvent.type(input, '2026-07-25');
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalledWith('2026-07-25');
    expect(dateInput()).toHaveValue('2026-07-15');
  });

  it('emits empty string when cleared', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-07-15" onChange={onChange} />);
    await userEvent.clear(dateInput());
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('opens the calendar from the calendar button and reflects a picked day', async () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-07-15" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /calendar/i }));
    const grid = await screen.findByRole('grid');
    const day = within(grid)
      .getAllByRole('button')
      .find((b) => b.textContent === '10' && b.getAttribute('aria-disabled') !== 'true');
    await userEvent.click(day!);
    expect(onChange).toHaveBeenLastCalledWith('2026-07-10');
    expect(dateInput()).toHaveValue('2026-07-10');
  });
});
