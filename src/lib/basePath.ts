// Vite's base differs per build: `/app/` for the app served at
// homeaccounting.com/app, `/` for the published demo at
// demo.homeaccounting.com. Anything that hardcodes one silently breaks under
// the other — the router prefixes every route with the wrong path, and the MSW
// worker 404s and stops intercepting, leaving the demo talking to an API that
// does not exist for that build.

export function routerBasename(base: string = import.meta.env.BASE_URL): string {
  const trimmed = base.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function assetUrl(file: string, base: string = import.meta.env.BASE_URL): string {
  return `${base.endsWith('/') ? base : `${base}/`}${file}`;
}
