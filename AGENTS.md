# AGENTS.md — Manufacturing ERP

Offline-first desktop ERP for metalware manufacturing: inventory, job-work
processing, purchasing, sales, and double-entry accounting.
Electron + React + SQLite.

**Read this file before ANY release work** (version bump, push, tag, installer).
It is the checklist that stops a release from dying halfway.

---

## 1. The release procedure (exact order)

Do these steps in this order. Skipping the pre-flight is what breaks CI.

### Step 1 — pre-flight (never skip, never "it passed last time")

```bash
# From the repo root. LOCAL binaries, never npx (see §2).
./node_modules/.bin/tsgo -p tsconfig.check.json     # type check
./node_modules/.bin/biome lint src tailwind.config.js   # lint
./node_modules/.bin/vitest run                      # full test suite
```

All three must exit 0 **and** print no findings. Then also run the full
pipeline once, because it is what CI runs:

```bash
npm run lint          # bash scripts/lint.sh — lint + type + consistency + tailwind + dead code + README
```

> **Never judge a command by `$LASTEXITCODE` after piping it.**
> `biome lint | Select-Object ...` reports the **pipe's** exit code, so a
> failing lint prints as "0". Capture the exit code FIRST:
> `$code = $LASTEXITCODE` right after the command, before any pipe.

### Step 2 — bump

```bash
npm version patch --no-git-tag-version        # or minor / major
```

Then update `src/config/version.ts` — `APP_VERSION` must match
`package.json`, and `BUILD_NUMBER` / `RELEASE_DATE` must be set to now:

```ts
export const APP_VERSION = '1.3.4';
export const BUILD_NUMBER = '20261111.1830';
export const RELEASE_DATE = '2026-11-11';
```

### Step 3 — commit

Commit the code first, then the bump as its own commit (the release-notes
generator skips `chore: bump version` commits):

```bash
git add -A
git commit -m "feat(scope): what changed and why"
git add package.json src/config/version.ts
git commit -m "chore: bump version to X.Y.Z"
```

### Step 4 — push the branch, then the tag

```bash
git push origin master
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

The **tag push is what starts the release** (`.github/workflows/release.yml`
fires on `v*` tags). The branch and the tag must carry the same commit:

```bash
git rev-parse HEAD
git ls-remote origin "refs/tags/vX.Y.Z^{}"     # must print the same sha
```

If they differ, the release is building the wrong commit. Fix the tag before
anything uploads.

### Step 5 — watch the run, do not assume

The tag push fires **Build & Release**. Watch it:

```bash
gh run list --workflow release.yml --limit 3
gh run watch <run-id>
```

The run must go green through every step. The release is only complete when
the release carries **both** assets:

```bash
gh release view vX.Y.Z --json assets --jq '.assets[] | "\(.state) \(.name) \(.size)"'
# expect: uploaded latest.yml
#         uploaded Manufacturing-ERP-Setup-X.Y.Z.exe
```

`state` must be `uploaded`. `new` means the upload is still in flight;
`missing` means it was never uploaded.

### Step 6 — confirm the update feed really works

```bash
curl -sIL https://github.com/beingadil/manufacturing-erp/releases/download/vX.Y.Z/latest.yml | head -1   # 200
curl -sIL https://github.com/beingadil/manufacturing-erp/releases/download/vX.Y.Z/Manufacturing-ERP-Setup-X.Y.Z.exe | head -1   # 200
```

A release with the installer but no `latest.yml` **breaks auto-update for
every installed app** — the updater 404s instead of offering the new version.

---

## 2. Traps in this repo — each one cost a failed release

| Trap | Why it hurts | What to do |
|---|---|---|
| `npx <tool>` in a script | npx resolves against the **npm registry** before falling back to the local install. On a slow/blocked registry `npm run lint` and the pre-push hook **hang for minutes with no output** | Always `node_modules/.bin/<tool>`. `scripts/lint.sh`, `scripts/consistency-check.sh`, `scripts/deadcode.sh` and `.githooks/pre-push` already do this — keep it that way |
| Two Biome instances at once | They fight for the same disk and each run goes from ~50s to ~8min | Never run Biome twice concurrently (not even a "quick" second check) |
| Biome over the whole workspace | It walks the 44,000 files under `node_modules` every run | Scope it: `biome lint src tailwind.config.js` |
| Removing a native `<select>` | The `formInputClass` import it used stays behind → CI's `noUnusedImports` fails → **the release build fails** | After deleting markup, delete the now-unused import and re-run Biome |
| Trusting electron-builder's exit code | It exits 0 while a 122MB upload is still in flight, or when the upload was rejected — v1.3.3 "published successfully" with only the blockmap on the release | The workflow now waits for the assets and checks their `state`. Never publish outside it |
| Re-publishing an asset that is still uploading | electron-builder deletes and re-uploads it, restarting the 122MB transfer forever | The publish step distinguishes `new` (in flight) from `missing` — do not re-upload while it is `new` |
| A release with no `latest.yml` | Every installed app 404s on the update feed and cannot update | The guard job rebuilds such a release; the run fails loudly. Fix it, do not skip it |
| An account code from a count | `generateAccountCode` used to count accounts per type, so deleting one and adding another reissued the freed code (two accounts on 1015, two on 6015) | Codes are **max-based** now (`nextAccountCode`) and a duplicate code is refused. Never go back to counting |
| `gh release edit` on an electron-builder release | It tries to CREATE the release and fails with "tag_name already exists" | PATCH the release through the REST API, or let the workflow's notes step do it |
| A stale tool process left running | A `tsgo` from a killed probe kept running for 30+ minutes at 1.8 GB and starved every later run. "The lint is slow" was really "three lints are fighting" | Before measuring anything, check `Get-Process node,tsgo,biome` and kill what is not yours. One tool at a time |
| `tsgo` on this Windows machine | The same type check CI does in seconds on Linux has run for **25+ minutes locally at ~10% CPU** — it is I/O-bound, not compute-bound. A stale `tsgo` was partly to blame, but the slowness survived with the machine idle | Config fixes applied (see §6). If it is still slow, measure a one-file check before blaming the config: a slow one-file check means the machine, not the program |

---

## 3. Where things live

| Area | File |
|---|---|
| Ledger statement (shared by Ledgers + General Ledger) | `src/components/ledger/LedgerStatement.tsx` |
| Statement period picker | `src/components/ledger/LedgerPeriodFilter.tsx` |
| Ledger PDF export | `src/components/ledger/exportLedgerStatement.ts` → `src/lib/documentGenerators.ts` |
| The one dropdown | `src/components/Dropdown.tsx` |
| Chart of accounts (add/edit/sub-types) | `src/pages/Accounting.tsx`, `src/components/AddAccountModal.tsx` |
| Chart rules (debit/credit normal, subtypes) | `src/lib/accounting/accountClassification.ts` |
| Ledger engine (opening, running, ordering) | `src/lib/accounting/AccountingEngine.ts` |
| Account codes | `src/lib/business/DocumentNumberingService.ts` |
| Posting rules per module | `src/lib/accounting/manufacturingPosting.ts` |
| Master-data forms | `src/components/forms/`, `src/components/form/` |
| Processing (send/receive/bill) | `src/pages/processing/` |
| Store + migrations | `src/store/useERPStore.ts`, `src/store/erpMigration.ts` |
| Electron main process | `electron/main.cjs` |
| Release workflow | `.github/workflows/release.yml` |
| Human release guide | `docs/RELEASING.md` |

---

## 4. Design rules

- Any UI work: load the **dimensional-drawing** skill first and work from
  **measured** values — read the real dimensions from the source (or measure
  the rendered element), never invent them. Mark anything unknown `[TBD]`.
- One control height per row, one radius per surface, one label size. A
  control row that is 44px and 46px in the same toolbar is a defect.
- Forms that must not scroll get **wider**, not shorter — and the footer
  action must stay reachable (`sticky bottom-0` inside a scrolling body).
- The ledger, the general ledger and the master-data forms share one visual
  language: same dropdown, same buttons, same spacing.

---

## 5. Ground rules

- The Electron main process is not covered by the unit tests. The
  `src/lib/electronApiCompatibility.test.ts` guard compares every
  `webContents.<method>()` call against the installed `electron.d.ts` — keep
  that guard passing; it is what stops a "installs but never opens" release.
- Data is the user's. A migration or a seed must never overwrite an
  existing chart of accounts, parties or vouchers.
- Commit messages are conventional commits (`feat`, `fix`, `test`, `docs`,
  `ci`, `chore`, `refactor`, `perf`) — the GitHub release notes are
  generated from them.

---

## 6. Where we left off (2026-11-11)

Work in progress, committed and pushed as `b41a399`:

**Done — the master-data form polish.**
The four create forms (Customer, Supplier, Processor, Raw Material) were built
from three different control languages. Now one system, in
`src/components/ui/formStyles.ts`:

| Token | Value |
|---|---|
| Control height | 46px (input, textarea, dropdown, searchable select, buttons) |
| Control radius | 12px |
| Focus | one soft halo — `ring-4 ring-primary/10` — no hard 1px ring |
| Label | 14px / `font-medium`, one required mark (red asterisk) |
| Close button | 32×32 hit area (was 28×28) |

- `Dropdown` was 42px tall next to 46px inputs → now 46px.
- The Raw Material usage question is now two option cards (icon, choice, the
  consequence of choosing it) instead of bare radio pills.
- Materials and Suppliers moved to the modal's **footer slot** like the other
  three — the save action is outside the scroll area on all of them now.
  `MaterialForm` / `SupplierForm` take `formId` + `showFooter` for this.

**Still to do:**
1. `npm run lint` + `npm test` must pass (the master-data Save-button suite
   `src/pages/masterDataForms.test.tsx` covers the footer move).
2. Build and check the forms in the preview at `http://localhost:4181`.
3. `tsgo` is still pathologically slow locally — see the trap table. The config
   fixes are in `tsconfig.check.json`: `"types": []` (no auto-inclusion of
   every `@types` package — `@types/jsdom` alone drags in a large DOM graph),
   `*.test.tsx` excluded (the old pattern only excluded `*.test.ts`), and
   `incremental: true`. `tsconfig.app.json` lost a `typeRoots` glob that walked
   all of `node_modules`.
