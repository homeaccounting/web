import { test as base, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// Shared test for clip specs. An auto fixture saves each recorded video to
// demo-assets/clips/<slug>.webm (slug from the test title) so walkthroughs land
// as cleanly-named files. Using base.extend (not a module-level afterEach) so
// the teardown runs for every clip spec, not just the first file that imports it.
const CLIPS_DIR = path.resolve(process.cwd(), 'demo-assets', 'clips');

export const test = base.extend<{ saveClip: void }>({
  saveClip: [
    async ({ page }, use, testInfo) => {
      await use();
      const video = page.video();
      await page.close();
      if (!video) return;
      const slug = testInfo.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      await mkdir(CLIPS_DIR, { recursive: true });
      await video.saveAs(path.join(CLIPS_DIR, `${slug}.webm`));
    },
    { auto: true },
  ],
});

export { expect };
