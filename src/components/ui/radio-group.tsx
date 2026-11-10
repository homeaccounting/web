import * as React from 'react';

import { cn } from '@/lib/utils';

// Dependency-free radio group with the shadcn RadioGroup API (`value` /
// `onValueChange` on the group, `value` on each item). Like Switch, it avoids
// pulling `@radix-ui/react-radio-group` because the repo's npm registry is not
// reachable in every environment. Native radios sharing a `name` give arrow-key
// navigation for free. Swap to the Radix-based shadcn RadioGroup later if
// desired — the props are compatible.
interface RadioGroupContextValue {
  name: string;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onChange' | 'defaultValue'
> {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, name, disabled, ...props }, ref) => {
    const generatedName = React.useId();
    const context = React.useMemo(
      () => ({ name: name ?? generatedName, value, onValueChange, disabled }),
      [name, generatedName, value, onValueChange, disabled],
    );
    return (
      <RadioGroupContext.Provider value={context}>
        <div role="radiogroup" ref={ref} className={cn('grid gap-2', className)} {...props} />
      </RadioGroupContext.Provider>
    );
  },
);
RadioGroup.displayName = 'RadioGroup';

export interface RadioGroupItemProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'checked' | 'defaultChecked' | 'onChange' | 'name'
> {
  value: string;
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, value, disabled, ...props }, ref) => {
    const group = React.useContext(RadioGroupContext);
    const checked = group?.value === value;
    return (
      <input
        type="radio"
        ref={ref}
        name={group?.name}
        value={value}
        checked={checked}
        disabled={disabled ?? group?.disabled}
        data-state={checked ? 'checked' : 'unchecked'}
        onChange={() => group?.onValueChange?.(value)}
        className={cn(
          'aspect-square h-4 w-4 cursor-pointer accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );
  },
);
RadioGroupItem.displayName = 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
