# ImmiFill — Chrome MV3 extension

Fills web forms (starting with Australian ImmiAccount) from Success CRM person
records. See `prd.md` for scope and `docs/CONTRACTS.md` for the frozen
cross-module contracts — schemas, message protocol, and build flags.

## Setup

| Step | Command | Notes |
| --- | --- | --- |
| Install | `pnpm install` | Runs `wxt prepare` via `postinstall` |
| Dev (HMR) | `pnpm dev` | Dev manifest, launches Chrome |
| Dev against CRM API | `pnpm dev:api` | Sets `WXT_DATA_SOURCE=api` |
| Build (dev manifest) | `pnpm build` | → `.output/chrome-mv3-dev/` |
| Build (prod manifest) | `pnpm build:prod` | → `.output/chrome-mv3/` |
| Zip for the store | `pnpm zip` | Production mode |

## Fixtures

Two origins serve the same `fixtures/` tree; the second is a non-declared origin
used to exercise the runtime host-permission grant path.

| Command | URL |
| --- | --- |
| `pnpm fixtures` | http://localhost:5174 |
| `pnpm fixtures:alt` | http://127.0.0.1:5175 |

Run both at once in separate shells.

## Load unpacked

1. `pnpm build`
2. `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → `.output/chrome-mv3-dev/`
4. Click the toolbar icon to open the side panel.

`pnpm dev` does steps 1–3 for you in a throwaway Chrome profile.

## Checks

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | `wxt prepare && tsc --noEmit` |
| `pnpm test` | Vitest (jsdom) unit tests in `tests/unit/` |
| `pnpm test:watch` | Vitest watch mode |
| `pnpm e2e` | Playwright against the unpacked dev build |
| `pnpm check:synthetic` | Fails if `data/people.json` holds non-synthetic emails or passport numbers; skips cleanly when the file is absent |

## Build flags

Set in `.env` (see `.env.example`) or as shell vars; only `WXT_`-prefixed names
are exposed to the bundle.

| Var | Default | Meaning |
| --- | --- | --- |
| `WXT_DATA_SOURCE` | `static` | `static` = bundled JSON (Phase 1); `api` = Success CRM |
| `WXT_CRM_BASE` | `''` | CRM API base URL, Phase 2 only |

## Layout

| Path | Contents |
| --- | --- |
| `entrypoints/background.ts` | Service worker: message router, `DataSource` calls |
| `entrypoints/content.ts` | Page detect, fill engine host, highlights, undo |
| `entrypoints/sidepanel/` | Preact side panel |
| `lib/schema/` | Zod schemas (CONTRACTS §1) |
| `lib/messages.ts` | Message union + `Result<T>` (CONTRACTS §3) |
| `lib/data/` | `DataSource` interface, errors, implementations |
| `data/` | `people.json` + `mappings/*.json` |
| `fixtures/` | Local test sites |
