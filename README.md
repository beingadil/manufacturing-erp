<div align="center">
  <img src="public/images/logo/logo-icon.svg" width="96" height="96" alt="Manufacturing ERP logo" />
  <h1>Manufacturing ERP</h1>
  <p><strong>Offline-first desktop ERP for metalware &amp; cutlery manufacturing</strong></p>
  <p>Raw material procurement &middot; Job-work processing &middot; Inventory &middot; Double-entry accounting</p>
</div>

<div align="center">

[![Release](https://img.shields.io/github/v/release/beingadil/manufacturing-erp?include_prereleases&style=flat-square)](https://github.com/beingadil/manufacturing-erp/releases/latest)
[![CI](https://github.com/beingadil/manufacturing-erp/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/beingadil/manufacturing-erp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/beingadil/manufacturing-erp?style=flat-square)](LICENSE)

[![Electron](https://img.shields.io/badge/Electron-43-47848F?logo=electron&logoColor=white&style=flat-square)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-087EA4?logo=react&logoColor=white&style=flat-square)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white&style=flat-square)](https://github.com/WiseLibs/better-sqlite3)
[![pnpm](https://img.shields.io/badge/pnpm-10+-F69220?logo=pnpm&logoColor=white&style=flat-square)](https://pnpm.io/)

</div>

---

A desktop ERP built for small and mid-sized metalware and cutlery plants. It runs entirely
offline on Windows, stores everything in a single local SQLite file, and covers the full
operational loop: buy raw material &rarr; send it out for job work &rarr; receive finished
goods &rarr; sell &rarr; post the accounting.

No server, no cloud account, no monthly fee. Your data never leaves the machine.

## Contents

- [Why this exists](#why-this-exists)
- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [Quality gates](#quality-gates)
- [Backup &amp; restore](#backup--restore)
- [CI/CD](#cicd)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Why this exists

Generic ERPs assume a factory buys a part, adds labour, and sells it. Utensil and cutlery
plants don't work that way: sheet and wire go **out** to a processor for stamping,
polishing or plating, come back as semi-finished pieces with real wastage, and only then
become finished goods. Most ERPs model none of that, so the wastage and the processing
charges silently disappear from the books.

Manufacturing ERP models that loop explicitly, and posts it all to a real double-entry
ledger.

## Features

| Module | What it does |
| --- | --- |
| **Dashboard** | KPI tiles, stock alerts, and financial summaries across the whole plant. |
| **Raw Materials** | Material master, purchase receipts, supplier ledger, consumption history. |
| **Job Work / Processing** | Dispatch raw material to out-source processors, receive semi-finished and finished goods, compute exact wastage and processing charges per batch. |
| **Processors** | Processor master with rates, outstanding-job tracking and settlement. |
| **Finished Goods** | Finished-goods stock, category tree, batch-level movement history. |
| **Purchases** | Purchase orders, GRN (Goods Receipt Notes), supplier payments, returns. |
| **Sales** | Order lifecycle, invoicing, dispatch, customer statements. |
| **Accounting** | Integrated double-entry ledger with automatic voucher generation from operational modules. Trial Balance, P&amp;L, Balance Sheet, Cash Flow, ledgers. |
| **Customers &amp; Suppliers** | Party master with balances and transaction history. |
| **Reports** | Exportable PDF and CSV reports across every module. |
| **Maintenance** | One-click backup, restore, system diagnostics, event logs, data-integrity checks. |
| **Security** | Role-based access control with a permission matrix, login history and audit logs. |

## Architecture

Electron main process + preload context bridge + React renderer, with **SQLite as the single
source of truth**.

```
 +-------------------------------------------------------------+
 |  Renderer (sandboxed)                                        |
 |  React 18 - React Router 7 - Zustand 5 - Tailwind + Radix   |
 +-----------------+-----------------------+-------------------+
                   |  window.electronDB    |  window.electronAI
 +-----------------v-----------------------v-------------------+
 |  Preload - contextBridge (electron/preload.cjs)              |
 +-----------------------------+-------------------------------+
                               |  IPC
 +-----------------------------v-------------------------------+
 |  Main process (electron/main.cjs)                            |
 |  - database.cjs : better-sqlite3, schema + migrations        |
 |  - ai.cjs       : local assistant integration                |
 |  - legacy-install-detector.cjs : prior-version handover      |
 +-----------------------------+-------------------------------+
                               |
                    +----------v-----------+
                    | %APPDATA%/           |
                    |  manufacturing-erp/  |
                    |   manufacturing-erp  |
                    |     .sqlite  <- truth|
                    |   backups/           |
                    +----------------------+
```

### Persistence rules that matter

- **SQLite is authoritative.** The renderer reads and writes through the `electronDB`
  bridge; the `.sqlite` file on disk is the real record.
- **The localStorage mirror can never silently overwrite a restored database.** A cached
  value is only allowed to win when it is explicitly flagged `unsynced` &mdash; and when it
  does, the winning value is written back to SQLite so the two converge. Synced mirrors are
  always discarded on load in favour of SQLite.
- **Restore is a whole-file replacement.** Importing a `.merpbak` replaces the database file
  outright and clears the `-wal` / `-shm` sidecars, so no stale write-ahead log can replay on
  top of the restored data.

## Tech stack

| Layer | Choice |
| --- | --- |
| Runtime | Electron 43 |
| UI | React 18, React Router DOM 7 |
| Language | TypeScript 5.9 |
| Build | Vite (`rolldown-vite`), electron-builder 25 |
| Styling | Tailwind CSS 3.4, shadcn/ui, Radix UI primitives |
| State | Zustand 5 |
| Persistence | SQLite via `better-sqlite3` 12 |
| Charts | Recharts |
| Export | jsPDF + jsPDF-AutoTable, SheetJS (`xlsx`) |
| Icons | Lucide React |
| Updates | electron-updater |
| Testing | Vitest 4, Testing Library |
| Linting | Biome 2.4, tsgo (native TypeScript), ts-prune |
| Package manager | pnpm 10+ |

## Getting started

**Prerequisites**

- Windows 10 or 11
- [Node.js](https://nodejs.org/) 20 or newer
- [pnpm](https://pnpm.io/installation) 10 or newer (`corepack enable pnpm`)

**Install and verify**

```bash
pnpm install       # install dependencies
pnpm lint          # full lint pipeline - type check, Biome, Tailwind, dead code
pnpm test          # Vitest unit suite
pnpm electron:dev  # build the renderer, then launch the desktop app
```

`pnpm electron:dev` runs `vite build` first and then starts Electron, because this is a
desktop application and needs the compiled renderer.

> **Note**
> `npm run dev` and `npm run build` are intentionally inert stubs that print a warning.
> They are not the way to run this project &mdash; use the `pnpm` commands above.

**Build a Windows installer**

```bash
pnpm electron:build:win
```

The NSIS installer is written to `dist-electron/`.

## Available scripts

| Script | What it does |
| --- | --- |
| `pnpm lint` | Full pipeline: `tsgo` type check, Biome lint, Biome/tsgo consistency guard, Tailwind CSS validation, dead-code scan. |
| `pnpm test` | Runs the Vitest suite once and exits non-zero on failure. |
| `pnpm electron:dev` | `vite build` then `electron .` &mdash; launch the app locally. |
| `pnpm electron:build:win` | Produces the signable NSIS installer in `dist-electron/`. |
| `pnpm deadcode` | ts-prune dead-code report on its own. |
| `pnpm dev` / `pnpm build` | Inert stubs &mdash; kept so they cannot silently do the wrong thing. |

## Quality gates

Everything below must be green before a change lands on `master`.

```bash
npx tsgo -p tsconfig.check.json   # type check
npx biome lint                    # lint
pnpm test                         # unit tests
pnpm lint                         # full pipeline
npx vite build                    # production build
```

Two Electron integration scripts cover what a unit test cannot reach. They drive the real
`electron/database.cjs`, so they run under the Electron runtime rather than plain `node`:

```bash
npx electron scripts/test-export-import-roundtrip.cjs   # export -> wipe -> import -> verify
npx electron scripts/test-backup-restore-flow.cjs       # backup -> restore -> mirror precedence
```

### Pre-push hook

This repo ships a pre-push hook that runs the type check and Biome lint locally, so a broken
commit fails in seconds instead of minutes later in CI:

```bash
git config core.hooksPath .githooks   # one-time per clone
```

Bypass with `git push --no-verify` only in emergencies.

## Backup &amp; restore

Settings &rarr; Maintenance &rarr; Backup &amp; Restore offers exactly two actions:

- **Export backup** &mdash; writes a single portable `.merpbak` file (manifest + SQLite
  bundle) anywhere you choose.
- **Import backup** &mdash; replaces the live database from a `.merpbak` file. Existing data
  is replaced, not merged; there is no partial import.

The importer rejects any file that is not a genuine Manufacturing ERP unified backup, so a
mis-named or truncated file fails loudly instead of quietly damaging the database. Take a
backup before any release or migration.

## CI/CD

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Push &amp; pull request on `master` | Lint-and-test gate; a red build blocks the pull request. |
| [`.github/workflows/release.yml`](.github/workflows/release.yml) | Tag `v*`, or manual dispatch | Packages the Windows installer and publishes a GitHub release with auto-update metadata. |
| [`.github/workflows/branch-protection.yml`](.github/workflows/branch-protection.yml) | Weekly cron | Re-applies the branch-protection settings on `master` so they cannot silently drift. |

Releases are cut by pushing a version tag &mdash; CI builds and publishes, nothing is built
from a laptop. Full instructions: [`docs/RELEASING.md`](docs/RELEASING.md).

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/DATABASE_ARCHITECTURE.md`](docs/DATABASE_ARCHITECTURE.md) | Persistence layer, SQLite bridging and the boot sequence. |
| [`docs/SQLITE_SCHEMA.md`](docs/SQLITE_SCHEMA.md) | Normalised tables, relationships and the migration engine. |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Visual design system &mdash; colour, typography, motion. |
| [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) | Release-readiness checklist. |
| [`docs/RELEASING.md`](docs/RELEASING.md) | How to cut a release so existing users receive the update. |
| [`CODE_SIGNING.md`](CODE_SIGNING.md) | Signing the Windows installer so SmartScreen stops warning: Azure Trusted Signing, public CAs, or a self-signed cert for local testing. |

## Contributing

Issues and pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md)
first &mdash; it covers the pnpm-only workflow, the checks a change must pass, and the commit
conventions.

## Security

Please do not open a public issue for a security problem. Follow the private reporting
process in [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) &copy; 2026 beingadil
