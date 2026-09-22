import { describe, it, expect } from 'vitest';
import { withNoindex } from './demo-noindex';

const doc = '<!doctype html>\n<html>\n  <head>\n    <title>x</title>\n  </head>\n  <body></body>\n</html>';

describe('withNoindex', () => {
  it('injects a noindex robots meta into the head', () => {
    const out = withNoindex(doc);
    expect(out).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(out.indexOf('robots')).toBeLessThan(out.indexOf('</head>'));
  });

  it('is idempotent when a robots meta already exists', () => {
    const already = doc.replace('</head>', '  <meta name="robots" content="all" />\n  </head>');
    expect(withNoindex(already)).toBe(already);
  });
});
