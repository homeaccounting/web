import { X } from 'lucide-react';

// Shared dismiss ("x") control for the fixed-position result toasts used by
// both banking import flows (SyncNowButton's pull sync and
// ImportStatementButton's file upload).
export function DismissButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="absolute right-2 top-2 rounded-sm opacity-70 transition-opacity hover:opacity-100"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
