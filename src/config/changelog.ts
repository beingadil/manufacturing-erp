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
