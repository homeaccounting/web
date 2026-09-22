/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEMO?: string;
  // Published sandbox only (demo.homeaccounting.com): adds the banner and
  // noindex. Kept separate from VITE_DEMO so the screenshot harness (#62),
  // which also runs demo mode, captures the app without demo chrome.
  readonly VITE_DEMO_PUBLIC?: string;
  readonly VITE_GOATCOUNTER_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
