import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Pure helper: builds the JSON body served at /app/info.
 * Exported for unit testing; the contract is exactly `{version, commit}`.
 */
export function buildInfoPayload(opts: { version: string; commit: string }): string {
  return JSON.stringify({ version: opts.version, commit: opts.commit });
}

function readVersion(): string {
  const pkgPath = resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}

function readCommit(): string {
  const fromEnv = process.env.APP_COMMIT_HASH;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'dev';
  }
}

/**
 * Vite plugin that exposes GET /app/info → {version, commit}.
 *
 * Dev: connect middleware on /app/info.
 * Build: emits a no-extension `info` asset at the bundle root, so after the
 *   production proxy strips /app/, Caddy serves /srv/info for /app/info.
 */
export default function infoEndpoint(): Plugin {
  const payload = buildInfoPayload({ version: readVersion(), commit: readCommit() });

  return {
    name: 'info-endpoint',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?', 1)[0];
        if (path === '/app/info') {
          res.setHeader('Content-Type', 'application/json');
          res.end(payload);
          return;
        }
        next();
      });
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'info',
        source: payload,
      });
    },
  };
}
