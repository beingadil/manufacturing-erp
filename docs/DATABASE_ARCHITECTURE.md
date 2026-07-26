# DATABASE ARCHITECTURE
**Version:** 1.0.0
**Target Environment:** Electron + SQLite

## 1. Overview
The W-RAW ERP leverages a **hybrid in-memory caching + asynchronous SQLite architecture**. 
To satisfy browser environment limitations and prepare for native desktop installation, the Database Layer is strictly decoupled from the UI and Business rules.

## 2. Abstraction Layers
1. **Presentation Layer:** React + Vite UI.
2. **Business Workflow Engine:** Centralized operations orchestrator (`BusinessWorkflowEngine.ts`). Executes domain rules (e.g. deductions, sub-ledger posting).
3. **Repository Layer:** Abstract CRUD wrappers mapping JSON/Objects to SQLite tables (`BaseRepository.ts`).
4. **Adapter Layer:** Exposes strict interfaces (`ISQLiteAdapter`) handling transactions, rollbacks, and multi-query execution.
5. **Driver Layer:** Handled by `MockSQLiteAdapter` currently in browser testing, mapped directly to `better-sqlite3` upon Electron build compilation.

## 3. Zustand Persistence Bridging
Instead of the business logic directly calling async SQLite transactions (which interrupts UI reactivity), `useERPStore` acts as the active RAM cache. 
- **Read Operations:** Read instantly from `useERPStore`.
- **Write Operations:** Mutate `useERPStore` locally to trigger React renders. The custom Database Service intercepts these changes, builds SQLite commands, and pushes them to the SQLite file asynchronously.
- **Boot Sequence:** Upon app start, `DesktopInterop.database.initialize()` pulls the master records from SQLite and populates Zustand RAM.

## 4. Electron Desktop Readiness
Because `ISQLiteAdapter` is implemented purely as an interface, when transitioning to Electron:
1. Provide an `ElectronSQLiteAdapter` implementing `ISQLiteAdapter`.
2. Swap the instantiation in `DatabaseService.ts` from `MockSQLiteAdapter` to the Electron IPC variant.
3. No business, React, or Validation logic needs to change.

## 5. Security & Isolation
- **Raw SQL prevention:** Business logic is prohibited from emitting raw SQL strings. All queries must flow through standard Repository interfaces (`findBy`, `create`).
- **File tampering:** SQLite file `.sqlite` will be secured with OS-level permissions in Electron under `app.getPath('userData')`.