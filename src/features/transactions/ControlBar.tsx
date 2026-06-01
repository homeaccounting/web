import { useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UUID } from '@/api/types';
import { CreateIncomeDialog } from './CreateIncomeDialog';
import { CreateExpenseDialog } from './CreateExpenseDialog';
import { CreateTransferDialog } from './CreateTransferDialog';

export interface ControlBarProps {
  selectedAccountId?: UUID;
}

export function ControlBar({ selectedAccountId }: ControlBarProps) {
  const [openIncome, setOpenIncome] = useState(false);
  const [openExpense, setOpenExpense] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
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
    </>
  );
}
