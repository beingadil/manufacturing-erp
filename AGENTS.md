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
| PDF `summaryRows` must be a FLAT array of row objects | `[[{...}]]` (a list whose member is itself a list) makes `row[dataKey]` undefined on every column, so the TOTAL row renders as an EMPTY row and the totals silently vanish — no error, no warning | The engine maps `summaryRows.map(row => columns.map(c => row[c.dataKey]))`, so each element must be `{ [dataKey]: value }`. ~20 report components and 4 document generators pass the nested shape today — see §6 |
| The PDF footer has three items on one baseline | "Printed By: … on <date>" (left) and the disclaimer (centred) overlap by ~20pt on A4 portrait — they print on top of each other and the text is unreadable | Measure the three strings before placing them; never let the left and centre items share a baseline unguarded |
| A stale tool process left running | A `tsgo` from a killed probe kept running for 30+ minutes at 1.8 GB and starved every later run. "The lint is slow" was really "three lints are fighting" | Before measuring anything, check `Get-Process node,tsgo,biome` and kill what is not yours. One tool at a time |
| `tsgo` on this Windows machine | The same type check CI does in **10 seconds** on Linux took **306 seconds for a SINGLE trivial file**. Ruled out: program size, path length (a `subst R:` short drive was just as slow), the registry, CPU/RAM pressure, the repo itself | **It was a corrupted pnpm store.** `biome.exe` and `tsgo.exe` were the *same* 533 KB stub (identical MD5) instead of 66 MB and 25 MB binaries — `pnpm store status` reports `ERR_PNPM_MODIFIED_DEPENDENCY` | `pnpm store status` → if it says "mutated", delete the listed `.pnpm/<pkg>` dirs **then** `pnpm install --force` and build IMMEDIATELY. **It recurs** — on 2026-11-15 core-js `es.regexp.exec.js` flipped back to the 533,504-byte MZP stub within minutes of a repair that had produced a good 274-byte file and a green build. If a build dies with "stream did not contain valid UTF-8" / "UNLOADABLE_DEPENDENCY" mid-day, this is why — repair and re-build, don't debug the code |

### When a tool is inexplicably slow, check the binary before the code

The symptom was "tsgo and biome are slow". The usual suspects were all
ruled out by measurement, in this order:

| Hypothesis | Test | Verdict |
|---|---|---|
| The program is too big | check ONE trivial file | 306s → **not the program** |
| The path is too long | `subst R:` and run from there | just as slow → **not the path** |
| The registry | read `getExePath.js` — it never calls out | **not the network** |
| The machine is thrashing | check `Memory Compression` / free RAM | idle → **not memory** |
| The tool itself is broken | `Get-FileHash` on the binary vs the expected size | **it was** — a 533 KB stub where a 66 MB binary belongs |

Two different tools having the **same file size** is the tell. Always compare
the binary against what the package should ship:
`node_modules/.pnpm/@biomejs+cli-win32-x64@*/node_modules/@biomejs/cli-win32-x64/biome.exe` should be ~66 MB.

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
| Google Drive backup upload | `electron/googleDrive.cjs` |
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
- **Google Drive backups**: OAuth credentials are **never in git** — GitHub push
  protection refused them. They are pasted once per machine into the Settings
  card (Backup & Restore → Google Drive Backup) and stored in userData
  (`google-drive.json`, keys `clientId`/`clientSecret`), separate from the
  encrypted refresh token. Scope is `drive.file` only. Revoke access from the
  card's "Sign out", swap credentials with "Change credentials". Nothing is ever
  deleted from Drive.
- Commit messages are conventional commits (`feat`, `fix`, `test`, `docs`,
  `ci`, `chore`, `refactor`, `perf`) — the GitHub release notes are
  generated from them.

---

## 6. Where we left off (2026-11-15)

**Not released.** Everything in this section is built, tested and verified in
the preview — it is waiting on the user to approve the commit and the release
(v1.3.7). Do not cut a tag without their go-ahead.

**Done — the phantom "Finished" stock bug (processing/inventory).**
Machine receipts were classed as "finished" whenever a custom-stages material's
`allowedStageIds` happened to end with Machine (tick order, not chain order).
Fix: `receiptProducesFinished` now sorts the selected stages by `sequence` and
finishes only at the chain-final one. `stageProgress.ts` was rewritten
(`visibleStagesForMaterial` — chain order, material-aware) so Raw Materials,
Material Detail, Purchase Detail and Send forms show the post-Machine next
step correctly.

**Done — auto-correction for previous-version users (startup replay, no schema
bump).** `migrateERPState` replays every material's trail on EVERY startup.
Three bugs made it keep the stale trail instead of healing it:

1. The replay's forced-creation fallbacks topped up stock, then asserted
   conservation against the **pre-top-up** baseline — guaranteed to throw
   "expected change 0". They now pass `expectedDelta = pcsSent`.
2. The stage stream replayed events in date order with **all sends before all
   receipts**, so same-day receipts hadn't landed when their dispatches
   replayed — the replay force-created the shortfall and inventory inflated.
   Now: chain order (stage sequence), sends before receipts within a stage.
3. A **batch path snapshot** on ONE batch hijacked the whole material's replay
   (a full_chain snapshot inside a custom_stages material re-modelled every
   dispatch). Now the replay always classifies under the material's CURRENT
   config; snapshots are honoured only to recognise ready-made lots.
   `consumeSaleStockFIFO` (replay only — live sales unchanged) falls back to
   WIP/raw when the re-derived finished bucket can't cover a legacy sale.

Verified against the real 2026-11-15 backup: **no conservation failures**,
2,759 PCS re-queued (Circle 16 1/4: 629→0 finished; Circle 15 1/4: 104→0;
Circle 13 1/2: 552→0; Circle 7 1/2 (0.9): 1,474→0), Press-only finished stock
untouched (Circle 7 1/2 (0.6): 1,112; 6 1/2: 3,540; 7 1/4: 2,907 — their
chain-final stage IS Press, so by the current-config rule they are finished).
Total inventory value unchanged. The user's 06:56-style "still finished after
re-expanding the material" is exactly this case — it heals on next startup.

**Done — guardrails (Send form).** Material picker hides materials with
nothing to send (ready-made + empty paths); qty input carries `max` and an
`onChange` clamp with the message "Only N PCS are available for <stage>"; the
submit guard (`overRequested`) stays as the backstop. Raw Materials page shows
the re-queued PCS as dispatchable (e.g. Circle 13 1/2: "1,251 from Initial ·
552 from Machine").

**Done — Processors page (work list + counts).** New columns: **Ready to
Work** (live PCS waiting at each processor's stage, computed per material's
own chain — a general worker sees raw stock at the entry stage) and
**This Month** (received/sent PCS). General workers pick up nothing outside
their chain.

**Done — mojibake ("ASCII errors") repaired system-wide.** Source: 4 files
carried double/triple-encoded text (useERPStore.ts — user-facing AppError
messages, voucher narrations, manufacturing remarks; processingStageSeed.ts —
stage descriptions; WipBoard.tsx — card subtitles; crudActions.test.ts) — all
repaired to correct UTF-8 (— · § × ÷ … ★). Data: the 2026-11-15 backup has
exactly 3 affected strings (Initial/Machine/Acid stage descriptions) — a tiny
`unmojibake` step in `migrateERPState` repairs them on next startup
(Latin-1 byte round-trip, only strings consisting entirely of U+0000–U+00FF,
nothing else touched; idempotent; regression-tested with the real strings).

**Done — Material Detail (`/materials/:id`) and the preview sheet (Parts 1 & 2).**
The material page now shows the whole purchase→processing story in one place:
**Purchased** is a headline stat in the summary strip; the Batches register
(the page's default) gained a **Purchased** column, a **TOTAL** footer, each
batch's **per-stage flow line** under it (e.g. `Initial 1,042→1,042 · Machine
707→707`), and dd-MMM-yyyy dates. The preview sheet (`RawMaterialPreview`)
was rebuilt the same way: an **ALL BATCHES — TOTALS** strip (Purchased / Raw
/ Waiting / WIP / Finished / On hand), every batch in one flat table with
supplier, date, a "who holds them now" line, a **TOTAL** footer that always
reconciles (verified: 1,042 = 1,022 Japan + 20 Sethi), purchase cost Σ and
processing cost Σ in one line. Dispatches & receipts and Movement ledger
section headers carry **filter dropdowns** (stage / event type).

**Done — the 1,042 vs 1,022 mystery on PO-2026-0009 (it was legal, just
truly invisible).** `DSP-2026-0018` drained 1,022 PCS from the Japan batch
and 20 PCS from SETHI-PO-2026-0006 (oldest stock first, the engine's exact
rule) — but the send carried no split, so the display showed the Japan
purchase as the sole source. The page now recomputes the drain in the
render with the engine's own order and shows the split on the row
(`incl. 20 from SETHI-PO-2026-0006`) plus a footnote on the per-stage cost
table stating the sibling's contribution and this purchase's 1,022 PCS.

**Done — Processor Detail page (`/processors/:id`).** Per-processor
workbench: Pending work (open dispatches oldest-first with material → batch
trail link, stage, sent / received / pending), KPI cards (Pending work / In
this month / Back this month / Balance payable), This month's receipts
(dd-MMM-yyyy), View-ledger access to the processor's sub-ledger. The
Processors table's name cell now links into it. Verified against the
backup (Haji Arshad: 9 receipts, Rs 158,590 payable, Rs 165,000 debited,
Rs 323,590 credited, 9 ledger entries).

**Done — Print & PDF overhaul (unreleased, Phases 1–3).** One shared engine
(`pdfEngine.ts`) for every document: measured header/footer (no overlap; the
PG disclaimer gets its own line when it doesn't fit), `summaryRows`
normalized so nested `[[{…}]]` reports can no longer render empty TOTAL rows,
raw values + per-column `format` specs, and the Print & PDF page gained
Currency (PKR default) / Decimals / Number locale / Date format (dd-MMM-yyyy
default) plus a live "Printed documents will use" preview line and a "Print a
sample statement" button. Print settings identity falls back to the live
dashboard brand when the seed placeholder is still stored. Voucher History
prints through the shared engine now (was raw HTML into a popup). The ledger
statement PDF was verified end-to-end (correct header identity, footer
"Printed By: Hamza Akram on 15-Nov-2026 · Page 1 of 1", PKR formats, flat
TOTAL row).

**The preview** (browser mirror of a real backup, for looking at UI changes):
- build: `./node_modules/.bin/vite build` → `dist/`
- data: `node %TEMP%\opencode\blob-from-nov15.cjs` writes
  `dist/restore-blobs.json` from `Downloads\manufacturing-erp-backup-2026-11-15.merpbak`
  (re-run AFTER every build — a build deletes the file)
- **4182 serves `<repo>\dist` (the live build); the 1.3.1 build output was
  renamed to `w-raw-erp-1.3.1-ARCHIVE`** — releases always come from
  `w-raw-erp` (the live repo).
  `node %TEMP%\opencode\preview-server.cjs "<repo>\dist" 4182`
- sign in: the session is `localStorage['offline-session']` =
  `{id, email, expires_at}`; the admin id comes from
  `erp-access-storage` → `state.users[0].id`
- restore blobs in the browser: fetch `/restore-blobs.json`, setItem every
  key under its name, reload (the app suspends writes, so the mirror is
  read-only — the re-derivation happens in memory on every load)

**Environment traps that bit today (2026-11-15):**
- The pnpm store re-corrupts mid-session — core-js `es.regexp.exec.js` went
  274 B → 533,504 B MZP stub between a green build (13:42) and 13:47. Fix:
  `pnpm store status` → `pnpm install --force` (delete the listed `.pnpm`
  dirs first) → **build immediately**, don't trust the machine to stay clean.
- The 4181 mirror serves the old release — verify against a fresh port (4182).

**Done — Phase 1 & 2 performance work (startup flat, subscriptions selective).**
- **Startup replay cache.** `migrateERPState` now stamps `trailVersion: 1`
  after a clean full replay and SKIPS the per-material trail replay on
  subsequent boots. First boot on the real backup replays as before; every
  boot after that stays flat no matter how large the history grows. If any
  material fails to replay, the marker is NOT stamped and the next boot
  re-attempts (fail-closed, same as before). Regression tests cover both
  paths (src/store/erpMigration.test.ts).
- **Selector subscriptions.** All 59 whole-store `useERPStore()`/`useSettingsStore()`
  calls converted to `useShallow` grouped selectors — the app no longer
  re-renders 59 components on every unrelated state change. Round-trip guard:
  `ERP_STORAGE_DATA_KEYS` allowlist + `partializeERPState` test proves the
  persisted shape can never silently lose keys (src/store/useERPStore.persist.test.ts).
- **`partialize` persist allowlist** on the erp-storage persist — only data
  keys are ever written; explicit, tested, additive.
- **Debounced search** in DataTable via `useDeferredValue` — keystrokes no
  longer run the filter on the hot path.
- **`React.memo`** added where prop-compare is provably correct:
  `BucketBar` (custom value-compare), `LedgerTable` (array-ref compare),
  `StageProgressStepper` (stable stage-ref + id-list compare).
- **Virtualization — intentionally NOT added.** Every long list in the app is
  already bounded by incremental rendering (LedgerStatement: 250-row windows +
  "show more"; movements on MaterialDetail: 200 + "show more"; DataTable:
  memoized 25/50/100 paging). Adding react-virtual would be speculative
  complexity for ≤250-row DOM trees; revisit when any list exceeds ~500
  rendered rows.
- Verified: tsgo 0, biome 0, **410 tests green**, lint.sh 0, boots clean on
  the real 2026-11-15 backup with **zero console errors**.

**Next (Phase 3 — not started, ask to proceed):** split the single 576 KB
erp-storage blob into per-store slices or move hot reads to the relational
tables (the ~30 SQLite indexes are currently decorative — reads never touch
them); route-level code splitting (2.88 MB initial bundle → ~400 KB);
action-level SQL for hot paths.
