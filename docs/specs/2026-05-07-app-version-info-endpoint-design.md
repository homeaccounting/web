# App version info endpoint — design

**Issue:** [homeaccounting/web#9](https://github.com/homeaccounting/web/issues/9) — _refactor: app version_

## 1. Goal

Expose the web app's version and commit hash through a static, well-known endpoint so that operators and tooling can answer "what's currently deployed?" against the frontend the same way they do against the backend.

The backend exposes `GET /api/info` (see `backend/src/Web/API/InfoAPI.hs`) returning `{status, version, commit, environment}`. The web app should expose an analogous endpoint, scoped to the data we can meaningfully provide from a static SPA bundle: **just `version` and `commit`**. `status` (always `"ok"`) and `environment` are intentionally omitted — they are not requested in the issue, and `environment` would force one Docker image per environment, conflicting with the current single-image build pattern.

## 2. Endpoint

```
GET /app/info  →  200 application/json
```

Response body:

```json
{ "version": "0.1.0", "commit": "abc123f" }
```

The endpoint lives under the `/app/*` namespace because that is the web SPA's URL space (per `docs/specs/2026-04-28-web-mvp-design.md`: "the proxy routes `/api/*` to the backend and `/app/*` to the static SPA bundle"). `/api/info` belongs to the backend and is not available to overload from the SPA bundle.

## 3. Data sources (resolved at build time)

| Field     | Source                                                                  |
| --------- | ----------------------------------------------------------------------- |
| `version` | `package.json` `version` field (bumped to `0.1.0` as part of this work) |
| `commit`  | precedence chain (extends backend's `mkVersionInfo` with a git step):   |
|           | 1. `APP_COMMIT_HASH` env var (set by Docker build-arg in image builds)  |
|           | 2. `git rev-parse --short HEAD` (when git is available — local dev)     |
|           | 3. literal `"dev"` fallback                                             |

The chain ensures: CI/release builds get a real short SHA, local `pnpm build` from a checkout gets the working-tree HEAD, and exotic builds without git or env (e.g., a tarball extracted into a sandbox) still produce a valid response.

## 4. Implementation

### 4.1 Vite plugin (`vite/plugins/info-endpoint.ts`)

A single Vite plugin is the source of truth. It computes the payload once per build/dev session and serves it through both Vite's dev server and the production bundle.

**Pure helper (exported, unit-tested):**

```ts
export function buildInfoPayload(opts: { version: string; commit: string }): string;
```

Returns a JSON string. Pure; no FS or env access.

**Plugin factory (default export):**

- `name: 'info-endpoint'`
- Resolves `version` from `package.json` and `commit` via the precedence chain above. Resolution happens once when the plugin is constructed/configured.
- `configureServer(server)`: registers a connect-style middleware on the dev server that, for `req.url === '/app/info'`, responds `200` with `Content-Type: application/json` and the payload. Other requests fall through.
- `generateBundle()`: calls `this.emitFile({ type: 'asset', fileName: 'info', source: payload })`, producing `dist/info`. The file lives at the bundle root (no `app/` subdirectory) because the production proxy strips the `/app/` prefix before reaching Caddy — `dist/info` is what Caddy ultimately serves for `/app/info`. This is consistent with how the rest of `dist/` is flat (e.g., `dist/index.html`, `dist/assets/`).

The plugin is wired in `vite.config.ts`:

```ts
import infoEndpoint from './vite/plugins/info-endpoint';
// ...
plugins: [react(), infoEndpoint()],
```

### 4.2 Test (`vite/plugins/info-endpoint.test.ts`)

Vitest unit test against `buildInfoPayload`:

- Returns valid JSON.
- Includes `version` and `commit` keys with the supplied values.
- Excludes any other keys (so the contract doesn't drift).

No e2e/integration test for the endpoint itself — the pure helper covers the contract, and the plugin's middleware/`emitFile` calls are thin wrappers around it.

### 4.3 Caddy

`Caddyfile` gains an explicit content-type header for the no-extension file:

```
header /info Content-Type application/json
```

The existing `try_files {path} /index.html` directive correctly serves `/info` because the file exists in the bundle; the SPA fallback only triggers for unknown paths.

### 4.4 Docker

`Dockerfile` accepts a new build-arg and forwards it to the build environment so the Vite plugin can read it:

```dockerfile
ARG APP_COMMIT_HASH=""
ENV APP_COMMIT_HASH=$APP_COMMIT_HASH
```

These two lines go in the `build` stage **before** `RUN pnpm build`, alongside the existing `VITE_API_BASE_URL` block.

The default (empty string) ensures plain `docker build .` without `--build-arg` still works — the plugin then falls back to git or `"dev"`.

### 4.5 CI (`.github/workflows/ci.yml`)

The `build-image` job already computes `sha_short`. Pass it as a build-arg:

```yaml
build-args: |
  VITE_API_BASE_URL=
  APP_COMMIT_HASH=${{ steps.meta.outputs.sha_short }}
```

### 4.6 `just publish`

The recipe already computes `SHA` for tagging. Pass it through:

```bash
docker build --platform linux/amd64 \
  --build-arg APP_COMMIT_HASH="$SHA" \
  -t "$IMAGE" .
```

### 4.7 `package.json`

Bump `"version": "0.0.0"` → `"0.1.0"`.

## 5. Files changed

| File                                 | Change                                                |
| ------------------------------------ | ----------------------------------------------------- |
| `vite/plugins/info-endpoint.ts`      | new — plugin + pure helper                            |
| `vite/plugins/info-endpoint.test.ts` | new — vitest unit test for `buildInfoPayload`         |
| `vite.config.ts`                     | import and register the plugin                        |
| `package.json`                       | `version: 0.1.0`                                      |
| `Caddyfile`                          | `header /info Content-Type application/json`          |
| `Dockerfile`                         | `ARG`/`ENV APP_COMMIT_HASH` in build stage            |
| `.github/workflows/ci.yml`           | pass `APP_COMMIT_HASH` build-arg                      |
| `justfile`                           | `publish` recipe passes `--build-arg APP_COMMIT_HASH` |

## 6. Out of scope

- `status` and `environment` fields (not requested; `environment` would require per-env image builds).
- Automated version bumping (manual bump in `package.json` for now).
- Surfacing the version in the UI (the issue is about the endpoint only).
- A general health-check endpoint distinct from version info.

## 7. Risks & mitigations

- **`generateBundle` `emitFile` content-type via Caddy** — file has no extension, so Caddy's MIME sniffing won't help. Mitigated by the explicit `header /info Content-Type application/json` directive.
- **`commit` is `"dev"` for plain `docker build`** — by design, but worth verifying in dev workflows. Mitigated: when developers run `pnpm build` locally (outside Docker), the git fallback fires and they get a real SHA.
- **Plugin resolves env once at plugin construction** — `pnpm build` reads `APP_COMMIT_HASH` at startup; this is fine because Vite invokes the plugin factory once per build. Watch mode (`vite dev`) also reads once at startup, which is the expected behavior.
