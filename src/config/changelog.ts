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
    version: '1.0.6',
    date: '2026-08-03',
    title: 'Accounting redesign & View Ledger drill-down',
    sections: [
      {
        title: '🚀 Features',
        items: [
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
