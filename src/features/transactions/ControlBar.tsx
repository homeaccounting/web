import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { AccountResponse, UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { AdjustBalanceDialog } from '@/features/accounts/AdjustBalanceDialog';
import { CreateIncomeDialog } from './CreateIncomeDialog';
import { CreateExpenseDialog } from './CreateExpenseDialog';
import { CreateTransferDialog } from './CreateTransferDialog';

export interface ControlBarProps {
  selectedAccountId?: UUID;
  selectedAccount?: AccountResponse;
}

const NO_ACCOUNTS_HINT = 'Create an account first';

function IconAction({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          aria-disabled={disabled}
          onClick={disabled ? undefined : onClick}
          className={cn('h-9 w-9', disabled && 'opacity-50')}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{disabled ? NO_ACCOUNTS_HINT : label}</TooltipContent>
    </Tooltip>
  );
}

export function ControlBar({ selectedAccountId, selectedAccount }: ControlBarProps) {
  const { data: accounts } = useAccounts();
  const hasAccounts = (accounts?.length ?? 0) > 0;
  const [openIncome, setOpenIncome] = useState(false);
  const [openExpense, setOpenExpense] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <span className="text-sm font-medium">Transactions</span>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <IconAction
              label="Add expense"
              icon={<ArrowUpFromLine />}
              disabled={!hasAccounts}
              onClick={() => setOpenExpense(true)}
            />
            <IconAction
              label="Add income"
              icon={<ArrowDownToLine />}
              disabled={!hasAccounts}
              onClick={() => setOpenIncome(true)}
            />
            <IconAction
              label="Add transfer"
              icon={<ArrowLeftRight />}
              disabled={!hasAccounts}
              onClick={() => setOpenTransfer(true)}
            />
            <IconAction
              label="Adjust balance"
              icon={<Scale />}
              disabled={!hasAccounts}
              onClick={() => setAdjusting(true)}
            />
          </div>
        </TooltipProvider>
      </div>
      <CreateIncomeDialog
        open={openIncome}
        onOpenChange={setOpenIncome}
        selectedAccountId={selectedAccountId}
      />
      <CreateExpenseDialog
        open={openExpense}
        onOpenChange={setOpenExpense}
        selectedAccountId={selectedAccountId}
      />
      <CreateTransferDialog
        open={openTransfer}
        onOpenChange={setOpenTransfer}
        selectedAccountId={selectedAccountId}
      />
      <AdjustBalanceDialog
        open={adjusting}
        onOpenChange={setAdjusting}
        selectedAccountId={selectedAccountId ?? selectedAccount?.id}
      />
    </>
  );
}
