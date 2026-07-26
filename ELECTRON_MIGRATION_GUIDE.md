# W-RAW ERP: Electron & SQLite Migration Guide

This guide outlines the architecture and step-by-step instructions to convert the current Web-based ERP application (which uses frontend `localforage` for persistence) into a fully offline, native Windows Desktop application powered by **Electron** and **SQLite3**.

## 1. Architectural Shift

### Current Architecture (Web)
- **Frontend**: React + Vite
- **State Management**: Zustand
- **Persistence**: Zustand `persist` middleware storing data in `IndexedDB` via `localforage`.
- **Database Rules**: Simulated via `databaseMiddleware.ts` catching updates before they hit Zustand.

### Target Architecture (Native Windows)
- **Frontend (Renderer Process)**: React + Vite
- **Backend (Main Process)**: Node.js + Electron
- **Database**: Native `sqlite3` reading/writing to `%APPDATA%/w-raw-erp/w-raw-erp.sqlite`
- **Communication**: Electron IPC (Inter-Process Communication). The frontend no longer saves directly to storage; instead, it sends SQL queries/commands to the main process via `window.electronAPI`.

---

## 2. Included Electron Configuration

We have already seeded the repository with the necessary files to run the Electron wrapper:

1. **`electron/main.js`**: The entry point for the Electron backend. Creates the window and handles IPC database calls.
2. **`electron/preload.js`**: Exposes secure APIs (`window.electronAPI.query`, `window.electronAPI.execute`) to the React frontend.
3. **`electron/database.js`**: Initializes the SQLite database file in the user's secure AppData directory and prepares the tables based on your schema.
4. **`vite.config.ts`**: Updated `base: "./"` so compiled assets use relative paths, which is mandatory for Electron `file://` protocols.
5. **`package.json`**: Added `electron`, `electron-builder`, and the necessary build scripts (`electron:build:win`).

---

## 3. Phase 1: Migrating Zustand to IPC (Developer Task)

To fully transition away from the frontend storage to the native SQLite database, you need to modify your Repositories/Services to route through the new Electron IPC rather than updating Zustand directly.

### Step 1.1: Detect Electron Environment
In your API/Service layer, detect if the app is running inside Electron:
```typescript
const isElectron = window?.electronAPI?.isElectron || false;
```

### Step 1.2: Refactor Repository Calls
Currently, `ZustandRepository.ts` writes directly to the Zustand store. You need to create an `ElectronRepository.ts` that implements the same interface but uses IPC.

**Example SQLite IPC call:**
```typescript
class ElectronRepository {
  async getAll(tableName) {
    if (window.electronAPI) {
      // Calls ipcMain.handle('db-query') in electron/main.js
      return await window.electronAPI.query(`SELECT * FROM ${tableName}`);
    }
  }

  async create(tableName, data) {
    const keys = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);
    
    // Calls ipcMain.handle('db-execute') in electron/main.js
    await window.electronAPI.execute(
      `INSERT INTO ${tableName} (${keys}) VALUES (${placeholders})`, 
      values
    );
  }
}
```

### Step 1.3: Update Database Schema Initialization
In `electron/database.js`, the `initializeSchema()` function currently contains basic examples for `materials` and `purchases`. You must expand this to include `CREATE TABLE` statements for all 18 tables defined in `src/db/Schema.ts` (Processors, Suppliers, Vouchers, LedgerEntries, etc.).

---

## 4. Phase 2: Building the Windows Executable (.exe)

Once the IPC routing is wired up, you can compile the project into a standalone Windows installer.

### Prerequisites (On your Windows Machine)
1. Install **Node.js** (v18 or higher)
2. Install **Git** (optional, but recommended)

### Build Instructions

1. **Unzip the provided source code** into a folder on your Windows machine.
2. **Open a terminal (PowerShell or Command Prompt)** in that folder.
3. **Install Dependencies**:
   ```bash
   npm install
   ```
   *Note: Since `sqlite3` relies on native C++ bindings, npm will automatically compile the Windows bindings using `node-gyp`. Ensure you have Python and Visual Studio Build Tools installed, or run `npm install --global windows-build-tools` if it fails.*

4. **Test in Development Mode**:
   ```bash
   npm run electron:dev
   ```
   This will compile Vite and launch the Electron App locally with DevTools open.

5. **Generate the Windows Installer**:
   ```bash
   npm run electron:build:win
   ```
   
### Output
After the build finishes, navigate to the `dist-electron/` folder. You will find:
- **`W-RAW ERP PROFESSIONAL Setup 1.0.0.exe`**: The standalone installer that you can distribute to your users. 

When installed, it will automatically create desktop shortcuts and store all data permanently and offline in the user's `%APPDATA%` folder.
