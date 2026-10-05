import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupRestoreTab } from "./BackupRestoreTab";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

// clearStorageMirrors() is the line that makes a restore stick — it drops the
// localStorage mirrors so a pre-restore write can't clobber the restored rows.
// Stubbed so we can assert it is actually called on a successful restore.
const clearStorageMirrors = vi.fn();
vi.mock("../../database/sqlite/SQLiteStorageAdapter", () => ({
  clearStorageMirrors: () => clearStorageMirrors(),
}));

const setElectronDB = (db: unknown) => {
  if (db === undefined) delete (window as any).electronDB;
  else (window as any).electronDB = db;
};

const manifest = {
  format: "manufacturing-erp-unified",
  appVersion: "1.0.42",
  createdAt: "2026-10-05T07:00:00.000Z",
  dbSize: 2_097_152,
  stores: ["erp-storage", "erp-access-storage", "erp-settings"],
  tableRowCounts: { categories: 12, materials: 40 },
};

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  clearStorageMirrors.mockClear();
  setElectronDB({
    isElectron: true,
    exportBackup: vi.fn(),
    importBackup: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  setElectronDB(undefined);
});

describe("BackupRestoreTab", () => {
  it("offers exactly two actions: backup to a file and restore from a file", () => {
    render(<BackupRestoreTab />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain("Backup to file");
    expect(buttons[1].textContent).toContain("Restore from file");
  });

  it("no longer exposes the removed snapshot / Google Drive surfaces", () => {
    render(<BackupRestoreTab />);

    const text = document.body.textContent ?? "";
    for (const removed of ["Google Drive", "Drive", "Connect", "Snapshot", "Delete", "Upload", "Auto backup"]) {
      expect(text).not.toContain(removed);
    }
  });

  it("backup writes through to the export bridge and reports the manifest", async () => {
    (window as any).electronDB.exportBackup.mockResolvedValue({
      success: true,
      path: "D:/backups/erp.merpbak",
      manifest,
    });

    render(<BackupRestoreTab />);
    fireEvent.click(screen.getByRole("button", { name: "Backup to file" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastSuccess.mock.calls[0][0]).toBe("Backup saved");
    expect((window as any).electronDB.exportBackup).toHaveBeenCalledTimes(1);

    // The "Last backup" panel surfaces what actually landed in the file.
    expect((await screen.findByText("Last backup")).textContent).toBe("Last backup");
    expect(screen.getByText("v1.0.42")).toBeTruthy();
    expect(screen.getByText("2.0 MB")).toBeTruthy();
    expect(screen.getByText(/categories: 12/).textContent).toContain("materials: 40");
  });

  it("a cancelled file dialog is not reported as an error", async () => {
    (window as any).electronDB.exportBackup.mockResolvedValue({ success: false, canceled: true });

    render(<BackupRestoreTab />);
    fireEvent.click(screen.getByRole("button", { name: "Backup to file" }));

    await waitFor(() => expect((window as any).electronDB.exportBackup).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(screen.queryByText("Last backup")).toBeNull();
  });

  it("restore confirms first and does not touch the database until confirmed", async () => {
    render(<BackupRestoreTab />);
    fireEvent.click(screen.getByRole("button", { name: "Restore from file" }));

    // Confirmation dialog shown, import not yet started.
    expect(await screen.findByText("Restore from a backup file?")).toBeTruthy();
    expect((window as any).electronDB.importBackup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /choose file and restore/i }));
    await waitFor(() => expect((window as any).electronDB.importBackup).toHaveBeenCalledTimes(1));
  });

  it("cancelling the confirm leaves the database untouched", async () => {
    render(<BackupRestoreTab />);
    fireEvent.click(screen.getByRole("button", { name: "Restore from file" }));
    await screen.findByText("Restore from a backup file?");
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText("Restore from a backup file?")).toBeNull());
    expect((window as any).electronDB.importBackup).not.toHaveBeenCalled();
    expect(clearStorageMirrors).not.toHaveBeenCalled();
  });

  it("a successful restore clears the storage mirrors so it cannot be undone", async () => {
    (window as any).electronDB.importBackup.mockResolvedValue({
      success: true,
      safetyBackupPath: "C:/userData/backups/pre-import-safety-1.sqlite.bak",
      manifest,
    });

    render(<BackupRestoreTab />);
    fireEvent.click(screen.getByRole("button", { name: "Restore from file" }));
    await screen.findByText("Restore from a backup file?");
    fireEvent.click(screen.getByRole("button", { name: /choose file and restore/i }));

    await waitFor(() => expect(clearStorageMirrors).toHaveBeenCalledTimes(1));
    expect(toastSuccess.mock.calls[0][0]).toMatch(/Restore complete/);
  });

  it("surfaces a restore failure instead of silently doing nothing", async () => {
    (window as any).electronDB.importBackup.mockResolvedValue({
      success: false,
      error: "Backup integrity check failed (SHA-256 mismatch).",
    });

    render(<BackupRestoreTab />);
    fireEvent.click(screen.getByRole("button", { name: "Restore from file" }));
    await screen.findByText("Restore from a backup file?");
    fireEvent.click(screen.getByRole("button", { name: /choose file and restore/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][1].description).toMatch(/SHA-256/);
    expect(clearStorageMirrors).not.toHaveBeenCalled();
  });

  it("explains itself instead of failing silently outside the desktop app", () => {
    setElectronDB(undefined);
    render(<BackupRestoreTab />);

    expect(screen.getByText("Desktop app required")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
