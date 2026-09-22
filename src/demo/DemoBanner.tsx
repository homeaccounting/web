// Shown only in the published demo (VITE_DEMO_PUBLIC), never in the demo build
// the screenshot harness drives (#62) — a banner keyed on VITE_DEMO alone would
// appear in every marketing capture.
export function DemoBanner() {
  return (
    <div
      role="note"
      className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-primary px-4 py-2 text-center text-sm text-primary-foreground"
    >
      <span>
        <strong className="font-semibold">Sandbox.</strong> Synthetic data that lives only in this
        browser — reload and it resets. Nothing you do here reaches a server.
      </span>
      <a className="underline underline-offset-2" href="https://homeaccounting.com/app">
        Use the real app →
      </a>
    </div>
  );
}
