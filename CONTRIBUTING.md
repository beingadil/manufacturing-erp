
# Contributing to Manufacturing ERP

Thanks for your interest. This document covers how to get the project running locally, what a
change has to pass before it can land, and the conventions the codebase follows.

## Ground rules

- **Windows is the primary target.** The app ships as a Windows desktop build and the release
  pipeline packages an NSIS installer. Changes are welcome from any platform, but please say
  on the pull request if something is Windows-only.
- **Use pnpm.** `pnpm-lock.yaml` is the lockfile that CI uses. Do not commit changes made
  with npm or yarn.
- **One concern per pull request.** Refactors and behaviour changes in the same PR make
  review hard and bisecting a regression harder.

## Setup

```bash
git clone https://github.com/beingadil/manufacturing-erp.git
cd manufacturing-erp
pnpm install
git config core.hooksPath .githooks   # enable the pre-push hook
```

You need Node.js 20 or newer and pnpm 10 or newer (`corepack enable pnpm`).

## Running the app

```bash
pnpm electron:dev      # vite build, then launch Electron
pnpm electron:build:win  # package a Windows installer into dist-electron/
```

`npm run dev` and `npm run build` are intentionally inert stubs. They exist so that an
accidental call cannot start a half-working Vite dev server for what is a desktop app. Use
the `pnpm` commands above.

## Checks your change must pass

Run these locally before opening a pull request. CI runs the same ones and a red build blocks
the merge.

```bash
npx tsgo -p tsconfig.check.json   # TypeScript type check
npx biome lint                    # lint
pnpm test                         # Vitest suite
pnpm lint                         # full pipeline, incl. dead-code + README checks
npx vite build                    # production build
```

If you touched backup, restore, or persistence code, also run the two Electron integration
scripts. They drive the real `electron/database.cjs`, so they need the Electron runtime
(`npx electron ...`), not plain `node`:

```bash
npx electron scripts/test-export-import-roundtrip.cjs
npx electron scripts/test-backup-restore-flow.cjs
```

The pre-push hook runs the type check and Biome lint automatically.

## Testing conventions

- Tests live next to the code they cover, named `*.test.tsx` or `*.test.ts`.
- Use Testing Library queries (`getByRole`, `getByLabelText`) over `data-testid` wherever a
  user-visible label exists.
- A bug fix should come with a test that fails before the fix. If you cannot reproduce the
  bug in a test, say so in the pull request.

## Code conventions

- **Formatting and lint are Biome's job.** Do not hand-format; run `npx biome lint` and let it
  guide you.
- **SQLite is the single source of truth.** The renderer reaches the database through the
  `electronDB` preload bridge. A `localStorage` mirror may only override a value when it is
  explicitly flagged `unsynced`, and when it does, the winning value is written back to
  SQLite. If you are tempted to read from `localStorage` directly, you are about to create a
  bug where a restored database gets silently overwritten.
- **Schema changes go in the migration engine** in `electron/database.cjs`, with tests. Never
  hand-edit a user's database file.
- **Keep the dead-code scan clean.** Unused exports surface in `pnpm deadcode`; remove them
  or wire them up rather than leaving them.

## Commit and pull request conventions

Use a short, imperative subject line with a conventional-commit prefix:

```
fix: clear WAL sidecars before opening a restored database
feat: add processor settlement report
docs: document the backup file format
chore: bump electron to 43
```

In the pull request description, state:

1. **What changed** and **why**.
2. **How you verified it** — name the commands you ran and the results.
3. Anything a reviewer should look at closely, and any risk to existing user data.

If your change alters the database schema or the `.merpbak` format, call that out explicitly.
Those affect every existing installation and need a migration path.

## Reporting bugs

Use the **Bug report** issue template. Include the app version (Settings shows it), your
Windows version, the module involved, and the steps to reproduce. The Maintenance screen has
a diagnostics view that collects most of this for you.

## Code of conduct

Participation is governed by [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
