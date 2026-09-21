# Contributing to HomeAccounting Web

Thanks for considering a contribution. This repository is the web client —
React, Vite, TypeScript and Tailwind. The API it talks to lives in
[homeaccounting/backend](https://github.com/homeaccounting/backend).

## Where things go

HomeAccounting is split across several repositories, and **issues belong to the
repository you are using**:

| What                                       | Where                                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| UI bug, layout problem, UX friction        | this repository's [Issues](https://github.com/homeaccounting/web/issues)   |
| API behaviour, bank provider, data problem | [homeaccounting/backend](https://github.com/homeaccounting/backend/issues) |
| Website / marketing content                | [homeaccounting/site](https://github.com/homeaccounting/site/issues)       |
| Questions, ideas, bank-provider requests   | [Discussions](https://github.com/orgs/homeaccounting/discussions)          |
| Anything conversational                    | [Community chat](https://www.homeaccounting.com/community) (Discord)       |
| **Security vulnerabilities**               | **Never an issue** — see [SECURITY.md](SECURITY.md)                        |

A bug that looks like a UI problem is often an API problem and the other way
round. File it wherever you saw it; we will move it if needed.

## Before you write code

For a visual or behavioural change beyond a small fix, **open an issue first and
include a screenshot or a short recording of the current behaviour.** Describing
UI in prose wastes a round trip.

Good first contributions are labelled
[`good first issue`](https://github.com/homeaccounting/web/labels/good%20first%20issue).

## Development setup

```bash
nix develop          # Node 22, pnpm, just (or install pnpm yourself)
just install
just run             # Vite dev server
```

`just --list` shows every recipe. What CI checks, and what you should run before
pushing:

| Command          | What it does                |
| ---------------- | --------------------------- |
| `pnpm typecheck` | `tsc --noEmit`              |
| `pnpm lint`      | ESLint                      |
| `pnpm format`    | Prettier, writing in place  |
| `pnpm test`      | Vitest                      |
| `pnpm build`     | production bundle           |
| `pnpm e2e`       | Playwright end-to-end tests |

CI runs typecheck, lint, `prettier --check`, tests and build. An unformatted
file fails the build, so run `pnpm format` before you push.

**Lockfile:** if you add a dependency behind a corporate npm mirror, run
`just lockfile-fix` — CI can only reach public npm and rejects private-registry
URLs in `pnpm-lock.yaml`.

## Things worth knowing

- **This is a finance UI.** Money is never a float in flight: amounts come from
  the API in an exact representation and must not be round-tripped through
  lossy arithmetic for display.
- **No real data in fixtures, tests, or screenshots.** Use the synthetic seed
  dataset. Screenshots in issues must be scrubbed of account numbers, contact
  names and balances.
- **Translations** live alongside the UI strings; English is the source of
  truth and other languages follow it.
- **Accessibility is a gate, not a nicety** — keyboard reachable, labelled
  controls, sufficient contrast in both themes.

## Commits and branches

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>[(scope)][!]: <description>
```

Types: `feat`, `fix`, `docs`, `refactor`, `chore`, `test`, `style`, `ci`,
`perf`, `build`. Breaking changes take `!` or a `BREAKING CHANGE:` footer.

Branches follow `<type>/<kebab-case-description>`, named after the goal of the
work — `feat/account-grouping`, not `fix/review-comments`.

## Pull requests

1. Branch off `master`.
2. Keep the PR focused on one goal.
3. Make sure typecheck, lint, format-check, tests and build pass locally.
4. **Include a before/after screenshot** for anything visible, in both light and
   dark themes if the change touches colour.
5. Title the PR in Conventional Commits form.
6. Sign the CLA — see below.

## Contributor Licence Agreement

Before your first pull request can be merged you will be asked to sign the
[Contributor Licence Agreement](CLA.md). A bot comments on the PR with a
one-line statement to post; that signature is recorded and you will not be asked
again.

The CLA exists so the project can keep its licensing options open. It does not
take your copyright away: you keep it, and you grant HomeAccounting a licence to
use your contribution.

## Code of Conduct

Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). Reports
go to `conduct@homeaccounting.com`.

## Licence

Contributions are licensed under [AGPL-3.0](LICENSE), the licence of this
repository. The HomeAccounting name and logo are not covered by that licence —
see the
[trademark policy](https://github.com/homeaccounting/backend/blob/master/TRADEMARK.md).
