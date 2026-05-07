import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { CreateAccountFormValues } from './schema';

export function SubtypeFields() {
  const { control, watch } = useFormContext<CreateAccountFormValues>();
  const kind = watch('subtype.type');

  if (kind === 'cash') {
    return (
      <FormField
        control={control}
        name="subtype.storageLocation"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Storage location</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
  if (kind === 'bankAccount') {
    return (
      <>
        <FormField
          control={control}
          name="subtype.bankName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bank name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.accountNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account number</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.cardNetwork"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Card network</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visa">Visa</SelectItem>
                    <SelectItem value="mastercard">Mastercard</SelectItem>
                    <SelectItem value="amex">Amex</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'eWallet') {
    return (
      <>
        <FormField
          control={control}
          name="subtype.provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.accountIdentifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account identifier</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'asset') {
    return (
      <>
        <FormField
          control={control}
          name="subtype.assetType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Asset type</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="property">Property</SelectItem>
                    <SelectItem value="vehicle">Vehicle</SelectItem>
                    <SelectItem value="stocks">Stocks</SelectItem>
                    <SelectItem value="retirementFund">Retirement fund</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'loan') {
    return (
      <>
        <FormField
          control={control}
          name="subtype.lender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lender</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.interestRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Interest rate (% APR)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="subtype.dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Due date (YYYY-MM-DD)</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  return null;
}
