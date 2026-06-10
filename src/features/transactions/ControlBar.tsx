import { useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AccountResponse, UUID } from '@/api/types';
import { AdjustBalanceDialog } from '@/features/accounts/AdjustBalanceDialog';
import { CreateIncomeDialog } from './CreateIncomeDialog';
import { CreateExpenseDialog } from './CreateExpenseDialog';
import { CreateTransferDialog } from './CreateTransferDialog';

export interface ControlBarProps {
  selectedAccountId?: UUID;
  selectedAccount?: AccountResponse;
}

export function ControlBar({ selectedAccountId, selectedAccount }: ControlBarProps) {
  const [openIncome, setOpenIncome] = useState(false);
  const [openExpense, setOpenExpense] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Transactions</span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Add expense"
            onClick={() => setOpenExpense(true)}
            className="h-9 w-9"
          >
            <ArrowUpFromLine className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Add income"
            onClick={() => setOpenIncome(true)}
            className="h-9 w-9"
          >
            <ArrowDownToLine className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Add transfer"
            onClick={() => setOpenTransfer(true)}
            className="h-9 w-9"
          >
            <ArrowLeftRight className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Adjust balance"
            disabled={!selectedAccount}
            onClick={() => setAdjusting(true)}
            className="h-9 w-9"
          >
            <Scale className="h-5 w-5" />
          </Button>
        </div>
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
      {selectedAccount && (
        <AdjustBalanceDialog
          open={adjusting}
          onOpenChange={setAdjusting}
          account={selectedAccount}
        />
      )}
    </>
  );
}
