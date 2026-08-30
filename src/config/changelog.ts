// src/config/changelog.ts
//
// In-app changelog shown in Settings → About & Updates so users can see
// what changed in each version without visiting GitHub. Keep newest first.
// Section titles mirror the release-notes generator in
// scripts/release-notes.sh so GitHub notes and the in-app notes stay
// consistent.

export interface ChangelogSection {
  title: string;
  items: string[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  sections: ChangelogSection[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.26',
    date: '2026-08-30',
    title: 'Accessibility Overhaul',
    changes: [
      'Accessible modals with focus trap, Escape key, and ARIA attributes on all pages',
      'AlertDialog replaces native confirm()/alert() in BackupRestore, Settings, Accounting',
      'Currency standardization: PKR throughout, shared formatCurrency() and formatDate() utils',
      'Dead code removal: 3 orphaned report stubs, unused multi-select component',
      'DataTable tabular-nums for proper number alignment',
      'Global accessibility: color-scheme, reduced-motion, overscroll-behavior, tabular-nums',
    ],
  },
  {
    version: '1.0.24',
    date: '2026-08-30',
    title: 'Spot Machine stage + auto-migration for existing data',
    sections: [
      {
        title: '🏭 Spot Machine processing stage',
        items: [
          'Added 5th processing stage: Spot Machine (final) — material flows through Initial Processor → Machine → Acid → Polish → Spot Machine before becoming saleable Finished Goods.',
          'Spot Machine is configurable as the final stage via the Stage Master — can be changed or removed without code edits.',
        ],
      },
      {
        title: '🔄 Auto-migration for existing users',
        items: [
          'Existing 4-stage data automatically migrates on startup: Spot Machine is added at sequence 5 with isFinalStage=true, Polish is unmarked as final.',
          'Processor Worker Type dropdown now shows all 5 stages including Spot Machine (Final).',
        ],
      },
    ],
  },

  {
    version: '1.0.21',
    date: '2026-08-26',
    title: 'Multi-stage processing engine + processor worker-type assignment',
    sections: [
      {
        title: '🏭 Multi-stage processing',
        items: [
          'Processing Stage Master — configurable chain (Initial Processor → Machine → Acid → Polish → Spot Machine) with sequence enforcement, per-stage billing units, and final-stage flag.',
          'Strict stage sequencing — material auto-advances through the chain; once received from stage N, it can only be sent to stage N+1. No going back.',
          'Partial processing with pending/loss tracking — receive 96 of 100 sent, the remaining 4 stay pending until explicitly received or recorded as loss.',
          'Per-stage processor billing — Machine Man (per KG), Acid Man (per KG), Polish (per KG), Spot Machine (per KG) each generate their own processor bill through the accounting engine.',
          `Batch stage-aware dispatch — the Send form detects a material's current stage and only shows eligible batches and workers for that stage.`,
        ],
      },
      {
        title: '👷 Processor worker-type assignment',
        items: [
          'New Worker Type dropdown when adding a processor — Initial Processor, Machine, Acid, Polish, or General.',
          'JobWork Send form filters workers by stage — only Acid workers appear when sending to Acid, only Machine workers for Machine, etc.',
          'Worker type column in the Processors master data table with colored badges.',
        ],
      },
      {
        title: '🎨 Form redesign',
        items: [
          'All Operations and Master Data forms widened to max-w-2xl with 2–3 column grids — no scroll bars needed.',
          'Removed excessive pb-64 padding across all modals and added max-h-[85vh] overflow-y-auto for safety.',
          'Processing Send/Receive/Bill modals redesigned with stage progress indicator and auto-detected stage.',
        ],
      },
    ],
  },
  {
    version: '1.0.20',
    date: '2026-08-17',
    title: 'Fully unattended releases — one command from now on',
    sections: [
      {
        title: '🚀 Release pipeline',
        items: [
          'New setup-gh-token.sh stores a workflow-scoped GitHub token in Windows Credential Manager (with validation and a hidden-input mode), and publish-release.sh now falls back to it automatically — future releases are a single command with no manual token step.',
          'Completes the v1.0.19 push: master and the v1.0.19 tag now point at the release commit on GitHub, and the release stays published with all three assets.',
        ],
      },
    ],
  },
  {
    version: '1.0.19',
    date: '2026-08-16',
    title: 'Much smaller installer + race-proof release pipeline',
    sections: [
      {
        title: '📦 Smaller, faster installer',
        items: [
          'Installer shrank from ~157 MB to ~99 MB and the packaged app data from 395 MB to 7.5 MB — updates download and install noticeably faster.',
          'Removed 11 production dependencies that were never used anywhere in the app (agent-SDK leftovers pulling in a ~150 MB charting closure).',
          'Moved the 58 renderer libraries that Vite bundles into the build to dev dependencies — only the two runtime modules the app actually loads ship in the package.',
          'Stripped better-sqlite3’s compile-time artifacts; only the compiled native module ships, so the database engine loads exactly as before.',
        ],
      },
      {
        title: '🚀 Release pipeline hardening',
        items: [
          'The CI release workflow no longer auto-triggers on tag pushes — a tag push can never race the local publish again (this caused the duplicate/orphaned releases in v1.0.18).',
          'The workflow is now manual-only and skips if a release for the version already exists, so double-publishing is impossible.',
        ],
      },
    ],
  },
  {
    version: '1.0.18',
    date: '2026-08-15',
    title: 'Working restore & import — backup data now actually comes back',
    sections: [
      {
        title: '💾 Backup & Restore — fixed end-to-end',
        items: [
          'Restore and Import now truly restore: a category/material/purchase saved before the backup and deleted afterwards comes back exactly as it was. Previously the app re-applied the newer pre-restore state from its local mirror, so restore appeared to do nothing.',
          'Restoring or importing invalidates the local persistence mirror so the restored database wins on reload — no more “restore ran but nothing changed”.',
          'Restore/import now remove stale WAL sidecar files before reopening the database, eliminating a classic SQLite corruption risk.',
        ],
      },
      {
        title: '🛡️ Persistence hardening',
        items: [
          'Mirror writes now carry an explicit “unsynced” flag — if SQLite fails to save a change (disk full, DB closed), that change is recovered from the mirror on the next launch instead of being silently lost.',
          'Writes to SQLite are serialized per store so rapid changes always land in order.',
          'Timestamps are millisecond-precision for exact SQLite-vs-mirror comparisons.',
          'Removed an unreachable legacy settings-migration code path; the storage adapter is now the single writer for every persisted store.',
        ],
      },
    ],
  },
  {
    version: '1.0.17',
    date: '2026-08-14',
    title: 'Deep cleanup — dead code removed, single authoritative service layer, stricter checks',
    sections: [
      {
        title: '🧹 Cleanup & Architecture',
        items: [
          'Deleted 11 orphaned files and ~1,300 lines of dead code across the app (never-referenced pages, hooks, validators, an orphaned Electron handler, and a duplicated calculation service).',
          'Removed the legacy AccountingService — AccountingEngine is now the single authoritative voucher layer; delete/create/update all flow through it from every UI entry point.',
          'Completed ProcessingService with bill create/update/delete and routed all Processing-module mutations through the service layer (validate → audit) instead of raw store calls.',
          'Enabled noUnusedImports/noUnusedVariables lint rules so unused code now fails the build instead of silently accumulating.',
        ],
      },
    ],
  },
  {
    version: '1.0.16',
    date: '2026-08-13',
    title: 'Unified module design system — KPI cards, redesigned tables & sidebar',
    sections: [
      {
        title: '🎨 UI / Design System',
        items: [
          'One canonical KPI card pattern (src/components/ui/KpiCard) now drives every headline metric in the app — Dashboard, Balance Sheet “Where you stand”, P&L “At a glance”, every report template, and the new module stat strips.',
          'Voucher pages redesigned — every voucher list now shows a KPI stat strip (Vouchers / Total Debit / Total Credit), and the entry modals match their page with accent bars, icon tiles, and the correct per-voucher-type color.',
        ],
      },
      {
        title: '📋 Tables across all modules',
        items: [
          'The shared DataTable (used by Categories, Raw Materials, Products, Customers, Suppliers, Processors, Purchases, Sales) gained: a sticky column header while scrolling, a filtered result-count pill, a clear-search button, aria-sort on sortable columns, First/Last page jump buttons, and a polished empty state.',
          'Row action buttons are now one shared component — consistent 32px targets, hover tint by tone, and accessible labels everywhere instead of tiny unlabeled icons.',
        ],
      },
      {
        title: '🗂️ Module pages & navigation',
        items: [
          'Categories redesigned: gradient header tile, live stats (Total Categories / Materials in System / Uncategorized), a per-category materials count column, badge-style sync status, and a polished add/edit modal (autofocus, Escape-to-close).',
          'Raw Materials, Products, Customers, Suppliers, and Processors all got matching gradient icon headers and 3-card KPI strips computed from real data (total payables/receivables, stock, inventory value).',
          'Sidebar redesigned: active items get a primary tint + left accent bar, nav groups are separated by dividers, and every module shows a live record-count badge (categories, materials, products, customers, suppliers, processors, purchases, sales).',
        ],
      },
    ],
  },
  {
    version: '1.0.15',
    date: '2026-08-12',
    title: 'Accessible money text & theme-aware charts',
    sections: [
      {
        title: '🎨 UI / Accessibility',
        items: [
          'Money and financial figures now pass WCAG AA contrast (4.5:1) on white — the success (green), destructive (red), info (blue), and warning (amber) text colors were darkened in light mode. Previously receipts, payments, and balances were hard to read (as low as 2.3:1). Dark mode was already compliant and is unchanged.',
          'Charts are now theme-aware — Revenue/Purchase trends, Top Products, and the monitor screen rank cards use the design-system chart tokens instead of hardcoded colors, with brighter variants in dark mode. Light mode looks pixel-identical to before.',
          'Completed the design-token system: --chart-1..5, --gradient-*, --shadow-card/hover, and education colors are now defined in both themes, so every utility mapped in the Tailwind config resolves.',
        ],
      },
    ],
  },
  {
    version: '1.0.14',
    date: '2026-08-12',
    title: 'Correct party balances & working Dashboard Branding',
    sections: [
      {
        title: '⚖️ Party balances — always the full ledger',
        items: [
          'Supplier, Customer, and Processor balances are now calculated from the COMPLETE ledger of their linked account (all entries summed), never from the latest/top entry. A supplier you bought from for Rs 276,000 and paid in full now correctly shows Rs 0 — even when the most recent ledger line is the big credit.',
          'Balances stay in sync through every flow: purchases, sales, processor bills, payments/receipts, and edit/delete of any of them. The listing balance on the Suppliers / Customers / Processors pages always matches the closing balance of the party ledger drill-down.',
          'Party and General Ledger tables now show the newest entry at the top, while the balance column still reflects the full running ledger.',
        ],
      },
      {
        title: '🎨 Dashboard Branding fixed',
        items: [
          'Fixed a crash when opening Settings → Dashboard Branding (an infinite re-render loop left a blank screen) — the tab now opens and saves normally.',
          'The Tagline setting is now shown in the top header and on the Login page (it was saved but never displayed before), and Logo Position now takes effect on the login screen.',
        ],
      },
    ],
  },
  {
    version: '1.0.13',
    date: '2026-08-12',
    title: 'Reliable backup & restore, per-line voucher narration, and module wipes',
    sections: [
      {
        title: '💾 Backup & Restore',
        items: [
          'Rebuilt backup/restore from scratch — creating a backup now writes the snapshot synchronously, so the file exists the moment the app says success (previously success was reported before the backup finished).',
          'One consistent Backup & Restore screen everywhere (Settings and System Maintenance share the same component); the old duplicate tab, the placeholder “Archive” tab, and the simulated “Tools” tab were removed.',
          'Snapshots can now be deleted from the list, and the newest 30 are kept automatically. Export/import of the portable .merpbak bundle (with SHA-256 integrity check) is unchanged and verified.',
        ],
      },
      {
        title: '📝 Voucher narration',
        items: [
          'Every voucher line now has its own narration field — Journal Voucher gained a Narration column and Cash/Bank payment & receipt rows accept a per-line description that shows in the ledger drill-down (falls back to the voucher-level narration when blank).',
        ],
      },
      {
        title: '🗑️ Delete & data management',
        items: [
          'Fixed the Purchase delete button — the confirmation dialog was never rendered; deleting now also reverses the linked voucher and stock correctly.',
          'Settings → Advanced now has a Wipe Module Data panel: pick one or more modules (with live record counts) and wipe them together or individually, with automatic cleanup of their vouchers and stock trail.',
        ],
      },
    ],
  },
  {
    version: '1.0.10',
    date: '2026-08-09',
    title: 'Fixed the stuck loading spinner after restart',
    sections: [
      {
        title: '🐛 Bug Fixes',
        items: [
          'Fixed a bug where the app could get stuck on a loading spinner after closing and reopening it with a saved session (the super-admin account). The app now restores your session and opens straight to the dashboard.',
        ],
      },
    ],
  },
  {
    version: '1.0.9',
    date: '2026-08-09',
    title: 'Instant startup — no loading screen, no forced update install',
    sections: [
      {
        title: '⚡ Performance',
        items: [
          'The app now opens directly to the login screen — the loading spinner is gone, and a startup recursion bug that could stall the app for many seconds was fixed (startup completes in ~150 ms).',
        ],
      },
      {
        title: '🔧 Updates',
        items: [
          'Updates now download silently in the background and install when you close the app or click “Restart & Update” — the app no longer quits itself and shows an installer window right after launch.',
        ],
      },
      {
        title: '🐛 Bug Fixes',
        items: [
          'Fixed an infinite recursion in the persistence layer that blocked startup whenever the database was still initializing — this also prevented data rehydration in some cases.',
        ],
      },
    ],
  },
  {
    version: '1.0.8',
    date: '2026-08-09',
    title: 'Instant startup & live financial position',
    sections: [
      {
        title: '⚡ Performance',
        items: [
          'The app now opens almost instantly — the UI renders immediately and your data loads in the background, so you no longer wait on a loading screen at every launch.',
        ],
      },
      {
        title: '🚀 Features',
        items: [
          'Financial & Inventory Position on the Dashboard — Cash in Hand, Bank Balance (per-bank breakdown), Inventory Value, Receivables, and Payables, all derived live from the accounting engine, with a date filter (Today / This Week / This Month / This Year / Custom).',
          'Financial Position panel — Total Assets, Total Liabilities, Owner’s Equity, Net Working Capital, and Period Profit/Loss, each linking to its report.',
          'Raw Materials now shows Total Value (PKR) per material and a total inventory value card — valued at weighted-average purchase cost, not selling price.',
        ],
      },
    ],
  },
  {
    version: '1.0.7',
    date: '2026-08-04',
    title: 'Corrected release — purpose-specific voucher forms',
    sections: [
      {
        title: '🚀 Features',
        items: [
          'Purpose-specific voucher forms — Cash Payment, Bank Payment, Cash Receipt, and Bank Receipt each have their own simple entry form (no tabs, no manual debit/credit lines). Cash pages auto-select Cash in Hand; bank pages show bank accounts only.',
          'Live “Accounting Effect” preview on every simple voucher — you see the generated DR/CR double entry (and a Balanced badge) before saving.',
          'Sub-ledger cascade — picking an Accounts Receivable / Accounts Payable control account reveals only its linked customers / suppliers, and posting is forced to the party child account.',
          'Journal Voucher keeps the full multi-line debit/credit table with totals, difference, and balanced-only posting.',
        ],
      },
      {
        title: '♻️ Release Note',
        items: [
          'The previous v1.0.6 was published without these new voucher forms — this release delivers them to every user, including anyone who already updated to v1.0.6. Your data is preserved.',
        ],
      },
    ],
  },
  {
    version: '1.0.6',
    date: '2026-08-03',
    title: 'Purpose-specific voucher forms & accounting redesign',
    sections: [
      {
        title: '🚀 Features',
        items: [
          'Purpose-specific voucher forms — Cash Payment, Bank Payment, Cash Receipt, and Bank Receipt each have their own simple entry form (no tabs, no manual debit/credit lines). Cash pages auto-select Cash in Hand; bank pages show bank accounts only.',
          'Live “Accounting Effect” preview on every simple voucher — you see the generated DR/CR double entry (and a Balanced badge) before saving.',
          'Sub-ledger cascade — picking an Accounts Receivable / Accounts Payable control account reveals only its linked customers / suppliers, and posting is forced to the party child account.',
          'Journal Voucher keeps the full multi-line debit/credit table with totals, difference, and balanced-only posting.',
          'Complete accounting redesign — a single source of truth (Voucher → Journal Entries → AccountingEngine → reports) powers every report.',
          'Five canonical voucher types with dedicated pages: Cash Payment, Bank Payment, Cash Receipt, Bank Receipt, and Journal Voucher — each list-first, defaulting to today, with date/account/party/voucher filters.',
          'New Cash Book page with single-date opening → receipts − payments → closing reconciliation.',
          'View Ledger drill-down on Customers, Suppliers, and Processors — inline balance cards (opening, debits, credits, receivable/payable) plus date-filtered ledger rows straight from the accounting engine.',
          'Subtype-based account classification (never name-based) with AR/AP control-account nesting for party sub-ledgers.',
          'Gap-free, year-scoped voucher and document numbering (CP/BP/CR/BR/JV, PO/INV/DSP/REC/BILL) that never reuses deleted numbers.',
        ],
      },
      {
        title: '♻️ Refactoring',
        items: [
          'Removed the old multi-entry "bento" voucher builder, Contra/Opening Balance modules, and the parallel ledgerEntries trail — dead code gone.',
          'Non-destructive persist v3 migration remaps legacy voucher types in place — existing data is preserved.',
        ],
      },
      {
        title: '🐛 Bug Fixes',
        items: [
          'Cancelled vouchers are now excluded from every report and ledger.',
          'Category and raw-material edits now refresh the table row immediately after saving.',
          'Voucher numbering no longer off-by-one in the form preview and is strictly year-scoped.',
        ],
      },
    ],
  },
  {
    version: '1.0.5',
    date: '2026-08-02',
    title: 'Unified voucher form design',
    sections: [
      {
        title: '🚀 Features',
        items: [
          'All voucher forms unified on the multi-entry bento design — cashbook, contra, and journal voucher builders now match.',
        ],
      },
    ],
  },
  {
    version: '1.0.4',
    date: '2026-08-01',
    title: 'Unified backups & bulletproof updates',
    sections: [
      {
        title: '🚀 Features',
        items: [
          'Unified `.merpbak` backup bundles — one portable file with the full SQLite database plus a manifest (version, stores, timestamps).',
          'Unified 4-store persistence — ERP data, users/roles, settings, and logs all survive restarts through one SQLite storage path.',
          'Auto-generated GitHub release notes with categorized changelogs for every release.',
        ],
      },
      {
        title: '🐛 Bug Fixes',
        items: [
          'Updates no longer wipe user data — a pre-update snapshot is taken and auto-restored if the database is ever missing.',
          'Fixed "installs a second app instead of updating" for per-user installs (stable app ID, in-place updates).',
        ],
      },
      {
        title: '🔧 CI & Build',
        items: [
          'Hardened the release pipeline so future versions publish via GitHub Actions (lint CI-safe, VS Build Tools for better-sqlite3).',
        ],
      },
    ],
  },
  {
    version: '1.0.3',
    date: '2026-07-30',
    title: 'Cash Module & native SQLite backup',
    sections: [
      {
        title: '🚀 Features',
        items: [
          'Complete Cash Module — Cash Receipt Vouchers, Cash Payment Vouchers, Contra Vouchers, Cash Book with running balance.',
          'Daily Cash Summary and finance dashboard cards (today\'s receipts, payments, closing cash).',
          'Auto-numbering per voucher type (CP, BR, JV, CV…) with yearly reset option and configurable prefixes.',
        ],
      },
      {
        title: '🐛 Bug Fixes',
        items: [
          'Consolidated backup/restore to a native SQLite format with an update-safe recovery path.',
          'Fixed black screen after login caused by a missing store reference in the dashboard.',
        ],
      },
    ],
  },
  {
    version: '1.0.2',
    date: '2026-07-28',
    title: 'Auto-update readiness',
    sections: [
      {
        title: '🚀 Features',
        items: [
          'Automatic update checks with background download and one-click install.',
        ],
      },
      {
        title: '🐛 Bug Fixes',
        items: [
          'Persisted user, role, and settings changes immediately so they survive app restarts.',
        ],
      },
    ],
  },
  {
    version: '1.0.1',
    date: '2026-07-26',
    title: 'Security & privacy cleanup',
    sections: [
      {
        title: '🔒 Security',
        items: [
          'Removed hardcoded console logging from business and workflow engines.',
          'Added MIT license and standardized package metadata.',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-18',
    title: 'Initial release',
    sections: [
      {
        title: '🚀 Features',
        items: [
          'Manufacturing ERP for inventory, purchases, sales, processing, and multi-ledger accounting.',
          'Offline-first desktop app with SQLite persistence and role-based access control.',
        ],
      },
    ],
  },
];
