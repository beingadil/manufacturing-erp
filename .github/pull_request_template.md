## What changed

<!-- Describe the change and, more importantly, why it was needed. Link the issue it fixes. -->

## How it was verified

<!-- Name the commands you ran and their result. CI runs these too, but state what you
     checked locally. -->

- [ ] `npx tsgo -p tsconfig.check.json`
- [ ] `npx biome lint`
- [ ] `pnpm test`
- [ ] `pnpm lint`
- [ ] `npx vite build`
- [ ] `npx electron scripts/test-export-import-roundtrip.cjs` *(if persistence or export/import changed)*
- [ ] `npx electron scripts/test-backup-restore-flow.cjs` *(if backup or restore changed)*

## Checklist

- [ ] This change is one concern, and does not bundle an unrelated refactor.
- [ ] Commits use conventional prefixes (`fix:`, `feat:`, `docs:`, `chore:`).
- [ ] No secrets, signing certificates, `.merpbak` files, or database files are included.
- [ ] New behaviour has a test; a bug fix has a test that fails without it.
- [ ] Docs updated where behaviour changed (README, `docs/`).

## Risk

<!-- If this touches the database schema, the .merpbak format, or anything that writes to a
     user's live data, say so explicitly and describe the migration path. Otherwise write
     "None — UI/typing only" or similar. -->
