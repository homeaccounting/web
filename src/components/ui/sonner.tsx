import { Toaster as SonnerToaster } from 'sonner';

// App-themed toaster. Uses design tokens so it matches light/dark automatically.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'bg-background text-foreground border border-border shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          error: 'text-destructive',
          success: 'text-positive',
        },
      }}
    />
  );
}
