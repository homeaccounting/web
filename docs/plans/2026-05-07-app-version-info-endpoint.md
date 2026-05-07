# App Version Info Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose `GET /app/info` from the static SPA bundle returning `{ version, commit }`, so the frontend can answer "what's deployed?" the same way the backend does at `/api/info`.

**Architecture:** A single Vite plugin (`vite/plugins/info-endpoint.ts`) is the source of truth. In dev (`pnpm dev`) it registers a connect-style middleware on `/app/info`; in build it emits `dist/info` via `this.emitFile`. The pure helper `buildInfoPayload({version, commit})` is exported for unit testing. `version` comes from `package.json`; `commit` comes from `APP_COMMIT_HASH` env → `git rev-parse --short HEAD` → `"dev"`. The Caddyfile, Dockerfile, CI workflow, and `just publish` recipe are updated so the env var is plumbed end-to-end and the no-extension `dist/info` file is served as `application/json`.

**Tech Stack:** TypeScript (strict, ESM), Vite 6, Vitest 3, Caddy 2, Docker, GitHub Actions, just.

**Spec:** `web/docs/specs/2026-05-07-app-version-info-endpoint-design.md`

**Issue:** [homeaccounting/web#9](https://github.com/homeaccounting/web/issues/9)

**Branch:** `feat/app-version-info-endpoint` (already created; the spec doc is already committed at `40a8785`).

**PR title:** `feat: expose app version and commit at /app/info`

All commands run from `/Users/oleksandrsy/Projects/Self/HomeAccounting/web` unless stated otherwise. Use `just` recipes where one fits; otherwise call `pnpm` directly.

---

## File map

**New files:**

| File                                 | Responsibility                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `vite/plugins/info-endpoint.ts`      | Vite plugin: pure `buildInfoPayload` helper + plugin factory + dev/build hooks |
| `vite/plugins/info-endpoint.test.ts` | Vitest unit test for `buildInfoPayload`                                        |

**Modified files:**

| File                       | Change                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `tsconfig.node.json`       | Extend `include` so the new plugin is part of the Node-side TS project               |
| `vite.config.ts`           | Import the plugin, add to `plugins` array, extend `test.include` to cover `vite/**`. |
| `package.json`             | Bump `version` from `0.0.0` to `0.1.0`                                               |
| `Caddyfile`                | Add `header /info Content-Type application/json`                                     |
| `Dockerfile`               | Add `ARG APP_COMMIT_HASH=""` + `ENV APP_COMMIT_HASH=$APP_COMMIT_HASH` (build stage)  |
| `.github/workflows/ci.yml` | Pass `APP_COMMIT_HASH=${{ steps.meta.outputs.sha_short }}` as build-arg              |
| `justfile`                 | `publish` recipe passes `--build-arg APP_COMMIT_HASH="$SHA"`                         |

---

## Phase 1 — Vite plugin (TDD)

### Task 1: Extend TS project + Vitest include for `vite/plugins/`

The plugin and its test live outside `src/`. The Node-side `tsconfig.node.json` only includes `vite.config.ts` today, and Vitest's `test.include` only matches `src/**`. Both need a small extension so type-checking and `vitest run` pick up the new files.

**Files:**

- Modify: `tsconfig.node.json` (extend `include`)
- Modify: `vite.config.ts` (extend `test.include`)

- [ ] **Step 1: Update `tsconfig.node.json` `include`**

Replace:

```json
"include": ["vite.config.ts"]
```

With:

```json
"include": ["vite.config.ts", "vite/**/*.ts"]
```

- [ ] **Step 2: Update `vite.config.ts` `test.include`**

In the `test` block, replace:

```ts
include: ['src/**/*.{test,spec}.{ts,tsx}'],
```

With:

```ts
include: ['src/**/*.{test,spec}.{ts,tsx}', 'vite/**/*.{test,spec}.ts'],
```

- [ ] **Step 3: Sanity check — both still pass without any plugin yet**

Run:

```bash
just typecheck
just test
```

Expected: both succeed (no new files yet to break anything; the wider include patterns just don't match anything new).

---

### Task 2: Add the failing unit test for `buildInfoPayload`

**Files:**

- Create: `vite/plugins/info-endpoint.test.ts`

- [ ] **Step 1: Write the test file**

Create `vite/plugins/info-endpoint.test.ts` with exactly this content:

```ts
import { describe, expect, it } from 'vitest';
import { buildInfoPayload } from './info-endpoint';

describe('buildInfoPayload', () => {
  it('returns valid JSON with the supplied version and commit', () => {
    const json = buildInfoPayload({ version: '0.1.0', commit: 'abc123f' });
    expect(JSON.parse(json)).toEqual({ version: '0.1.0', commit: 'abc123f' });
  });

  it('emits exactly two keys (no extras like status or environment)', () => {
    const json = buildInfoPayload({ version: '9.9.9', commit: 'deadbee' });
    expect(Object.keys(JSON.parse(json) as Record<string, unknown>).sort()).toEqual([
      'commit',
      'version',
    ]);
  });
});
```

The two tests pin the two contract properties from the spec (§2 and §6 — the response is exactly these two keys, nothing more).

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
pnpm exec vitest run vite/plugins/info-endpoint.test.ts
```

Expected: failure — the import resolves to a non-existent module (`Cannot find module './info-endpoint'` or equivalent). This is the "red" of red-green-refactor.

---

### Task 3: Implement the plugin

**Files:**

- Create: `vite/plugins/info-endpoint.ts`

- [ ] **Step 1: Write the plugin file**

Create `vite/plugins/info-endpoint.ts` with exactly this content:

```ts
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
        if (req.url === '/app/info') {
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
```

Notes:

- `process.cwd()` is fine because Vite always runs from project root in dev/build/test.
- `execSync` `stdio` is set so `git rev-parse` failure (e.g., no `.git` dir) doesn't pollute build logs.
- Resolution happens once when the plugin factory is invoked; this matches Vite's per-build-session model and is documented in the spec's risks section.

- [ ] **Step 2: Run the unit test and confirm it passes**

Run:

```bash
pnpm exec vitest run vite/plugins/info-endpoint.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Run the full suite to confirm nothing else broke**

Run:

```bash
just test
```

Expected: full pass, including the two new tests.

---

### Task 4: Wire the plugin into `vite.config.ts`

**Files:**

- Modify: `vite.config.ts`

- [ ] **Step 1: Add the import and register the plugin**

Add this import near the other top-of-file imports:

```ts
import infoEndpoint from './vite/plugins/info-endpoint';
```

Update the `plugins` array from:

```ts
plugins: [react()],
```

to:

```ts
plugins: [react(), infoEndpoint()],
```

- [ ] **Step 2: Type-check**

Run:

```bash
just typecheck
```

Expected: clean.

- [ ] **Step 3: Manual dev smoke test**

In one terminal:

```bash
just run
```

Wait for `Local: http://localhost:5173/app/`. Then in another terminal:

```bash
curl -s -i http://localhost:5173/app/info
```

Expected:

- `HTTP/1.1 200 OK`
- `Content-Type: application/json`
- Body: `{"version":"0.0.0","commit":"<short-sha-or-dev>"}`

(Version is still `0.0.0` here; we bump it in Task 8.)

Stop the dev server (`Ctrl+C`).

- [ ] **Step 4: Manual build smoke test**

Run:

```bash
just build
```

Then verify the asset:

```bash
test -f dist/info && cat dist/info && echo
```

Expected: file exists; output is the same JSON shape as above.

---

## Phase 2 — Production plumbing

### Task 5: Caddyfile content-type

**Files:**

- Modify: `Caddyfile`

- [ ] **Step 1: Add the header directive**

The current file is:

```
:80 {
	root * /srv
	encode zstd gzip
	try_files {path} /index.html
	file_server
}
```

Add `header /info Content-Type application/json` so it becomes:

```
:80 {
	root * /srv
	encode zstd gzip
	header /info Content-Type application/json
	try_files {path} /index.html
	file_server
}
```

The path is `/info` (not `/app/info`) because the production proxy strips the `/app/` prefix before requests reach Caddy — the SPA is served from a flat `/srv` already, and this directive follows the same convention.

- [ ] **Step 2: Validate Caddy syntax (no Caddy install required if Docker is available)**

Run:

```bash
docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile" caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Expected: `Valid configuration`.

If Docker isn't available, skip — the Dockerfile build in Task 6 will fail loudly if Caddy rejects the file at container startup.

---

### Task 6: Dockerfile build-arg

**Files:**

- Modify: `Dockerfile`

- [ ] **Step 1: Add the new build-arg + env**

Current build stage:

```dockerfile
COPY . .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm build
```

Change to:

```dockerfile
COPY . .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG APP_COMMIT_HASH=""
ENV APP_COMMIT_HASH=$APP_COMMIT_HASH
RUN pnpm build
```

Default empty string preserves the "plain `docker build .` works" behavior — the plugin then falls back to git or `"dev"`.

- [ ] **Step 2: Build the image locally and verify the asset is in it**

Run:

```bash
docker build --platform linux/amd64 \
  --build-arg APP_COMMIT_HASH=test-sha \
  -t homeaccounting-web:plan-check .
```

Expected: build succeeds.

Then verify the file is in the runtime image:

```bash
docker run --rm --entrypoint sh homeaccounting-web:plan-check -c 'cat /srv/info && echo'
```

Expected: `{"version":"0.1.0",...,"commit":"test-sha"}` — except `version` will be whatever is in `package.json` at the time. (After Task 8 it's `0.1.0`. Run this sanity check after Task 8 if you want the final version output; for this task just confirm the file exists and `commit` is the build-arg value.)

Optional: spin the container up and `curl` the endpoint end-to-end:

```bash
docker run --rm -d -p 8088:80 --name web-plan-check homeaccounting-web:plan-check
curl -s -i http://localhost:8088/info
docker stop web-plan-check
```

The container itself listens at `:80` without the `/app/` proxy prefix, so the path inside the container is `/info`. End-to-end with the proxy it's `/app/info`.

Expected: `200`, `Content-Type: application/json`, body has both keys.

---

### Task 7: CI build-arg

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add `APP_COMMIT_HASH` to the `build-args` block**

Current `build-image.steps[Build and push]`:

```yaml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    context: .
    push: true
    tags: ${{ steps.tags.outputs.tags }}
    build-args: |
      VITE_API_BASE_URL=
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Add the new build-arg under `build-args:` (preserve the existing empty `VITE_API_BASE_URL=` line as-is — see spec §4.5 advisory):

```yaml
- name: Build and push
  uses: docker/build-push-action@v6
  with:
    context: .
    push: true
    tags: ${{ steps.tags.outputs.tags }}
    build-args: |
      VITE_API_BASE_URL=
      APP_COMMIT_HASH=${{ steps.meta.outputs.sha_short }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

- [ ] **Step 2: Lint the YAML (visual)**

Open the file and confirm indentation matches surrounding blocks (both arg lines at the same indent level under `build-args:`).

No automated YAML lint is wired up in this repo; the change is mechanical and small enough to eyeball. CI will fail loudly on the next push if the YAML is malformed.

---

### Task 8: `just publish` build-arg + `package.json` version bump

These are two trivial edits — group them in one task to minimize churn.

**Files:**

- Modify: `justfile`
- Modify: `package.json`

- [ ] **Step 1: Update `justfile` `publish` recipe**

The recipe currently runs:

```bash
docker build --platform linux/amd64 -t "$IMAGE" .
```

Change to:

```bash
docker build --platform linux/amd64 \
  --build-arg APP_COMMIT_HASH="$SHA" \
  -t "$IMAGE" .
```

`SHA` is already computed earlier in the recipe (`SHA="$(git rev-parse --short HEAD)"`), so this just reuses it.

- [ ] **Step 2: Bump `package.json` version**

Replace:

```json
"version": "0.0.0",
```

With:

```json
"version": "0.1.0",
```

- [ ] **Step 3: Verify both files**

```bash
grep -n 'APP_COMMIT_HASH' justfile
grep -n '"version"' package.json
```

Expected: `justfile` shows the new `--build-arg` line; `package.json` shows `"version": "0.1.0"`.

---

## Phase 3 — Final validation and commit

### Task 9: Full check + commit

**Files:** none (verification + git).

- [ ] **Step 1: Run all checks**

```bash
just all
```

This runs `check` (typecheck + lint + format-check) plus `test` plus `build`.

Expected: all green. The build also produces `dist/info` — if `git rev-parse` is available (it is, locally), the `commit` value will be a real short SHA.

- [ ] **Step 2: Sanity-check the built asset**

```bash
cat dist/info && echo
```

Expected: `{"version":"0.1.0","commit":"<short-sha>"}`.

- [ ] **Step 3: Stage and commit**

```bash
git add \
  vite/plugins/info-endpoint.ts \
  vite/plugins/info-endpoint.test.ts \
  vite.config.ts \
  tsconfig.node.json \
  package.json \
  Caddyfile \
  Dockerfile \
  .github/workflows/ci.yml \
  justfile
```

(The spec and plan documents are committed separately to the branch ahead of implementation.)

```bash
git commit -m "$(cat <<'EOF'
feat: expose app version and commit at /app/info

Adds a Vite plugin (vite/plugins/info-endpoint.ts) that serves the
endpoint in dev via middleware and emits dist/info at build time.
Caddyfile, Dockerfile, CI workflow, and `just publish` are updated
so APP_COMMIT_HASH is plumbed end-to-end. Bumps the package version
to 0.1.0.

Refs #9
EOF
)"
```

Expected: commit succeeds (no pre-commit hooks to skip — there are none configured in this repo).

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/app-version-info-endpoint
gh pr create --title "feat: expose app version and commit at /app/info" --body "$(cat <<'EOF'
## Summary
- Adds `GET /app/info` to the SPA bundle, returning `{ version, commit }`
- Single Vite plugin handles dev (middleware) and prod (emits `dist/info`)
- `APP_COMMIT_HASH` is plumbed through Dockerfile, CI, and `just publish`
- Bumps `package.json` version to `0.1.0`

Closes #9

## Test plan
- [ ] `just all` is green
- [ ] `just run` then `curl http://localhost:5173/app/info` returns `200 application/json` with both keys
- [ ] `just build` produces `dist/info` with the same shape
- [ ] CI build-image job logs show `APP_COMMIT_HASH` build-arg picked up
EOF
)"
```

---

## Out of scope

- `status` and `environment` fields (per spec §6).
- Surfacing the version in the UI (issue scope is the endpoint only).
- Automated version bumping (manual bump for now).
