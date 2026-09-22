import type { Plugin } from 'vite';

const NOINDEX_META = '<meta name="robots" content="noindex, nofollow" />';

/**
 * Pure helper: adds a `noindex` robots meta to an HTML document's head.
 * Idempotent — an existing robots meta is left alone. Exported for testing.
 */
export function withNoindex(html: string): string {
  if (/name=["']robots["']/.test(html)) return html;
  return html.replace('</head>', `  ${NOINDEX_META}\n  </head>`);
}

/**
 * The published sandbox serves the whole app on its own domain. Left indexable
 * it would compete with the real app for brand searches and put synthetic data
 * in front of people looking for the product, so the demo build ships a
 * noindex (belt) alongside the robots.txt the workflow writes (braces).
 */
export default function demoNoindex(enabled: boolean): Plugin {
  return {
    name: 'demo-noindex',
    transformIndexHtml(html) {
      return enabled ? withNoindex(html) : html;
    },
  };
}
