import { createRoot } from 'react-dom/client';

// The sandbox runs entirely in the browser, so if the service worker cannot
// register there is no API behind the app at all. Private windows and some
// extensions block registration; without this the visitor gets a blank screen
// and no idea why.
export function renderDemoUnavailable(container: HTMLElement) {
  createRoot(container).render(
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">This demo needs a service worker</h1>
      <p className="text-muted-foreground">
        The sandbox runs entirely inside your browser, which requires a service
        worker — yours blocked it. Private browsing and some extensions do that.
        Try a normal window, or go straight to the real app.
      </p>
      <a
        className="underline underline-offset-2"
        href="https://homeaccounting.com/app"
      >
        Use the real app →
      </a>
    </div>,
  );
}
