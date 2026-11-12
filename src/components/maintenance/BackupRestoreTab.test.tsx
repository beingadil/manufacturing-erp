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
    googleStatus: vi.fn().mockResolvedValue({ configured: false, signedIn: false }),
    googleSignIn: vi.fn(),
    googleSignOut: vi.fn(),
    googleUploadBackup: vi.fn(),
    googleSetCredentials: vi.fn().mockResolvedValue({ success: true }),
    googleClearCredentials: vi.fn().mockResolvedValue({ success: true }),
    googleListBackups: vi.fn().mockResolvedValue({
      success: true,
      files: [
        {
          id: "drive-file-1",
          name: "manufacturing-erp-backup-2026-11-11.merpbak",
          size: 2_097_152,
          createdTime: "2026-11-11T07:00:00.000Z",
          webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
        },
        {
          id: "drive-file-2",
          name: "manufacturing-erp-backup-2026-10-30.merpbak",
          size: 1_048_576,
          createdTime: "2026-10-30T04:30:00.000Z",
          webViewLink: null,
        },
      ],
      folderName: "Manufacturing ERP Backups",
      folderId: "folder-1",
    }),
    googleRestoreBackup: vi.fn().mockResolvedValue({ success: true, manifest: { appVersion: "1.3.2", stores: ["erp-storage"], createdAt: "2026-11-11T07:00:00.000Z" } }),
  });
});

afterEach(() => {
  cleanup();
  setElectronDB(undefined);
});

describe("BackupRestoreTab", () => {
  it("offers the backup and restore actions", async () => {
    render(<BackupRestoreTab />);

    await waitFor(() =>
      expect((window as any).electronDB.googleStatus).toHaveBeenCalled()
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons[0].textContent).toContain("Backup to file");
    expect(buttons[1].textContent).toContain("Restore from file");
  });

  it("shows the Google Drive card with a paste-credentials form when the keys are not in place", async () => {
    render(<BackupRestoreTab />);

    expect(await screen.findByText("Google Drive Backup")).toBeTruthy();
    expect(screen.getByText(/not set up/i)).toBeTruthy();

    // The credentials form is available in place — no need to rebuild the app.
    const idInput = screen.getByLabelText(/client id/i) as HTMLInputElement;
    const secretInput = screen.getByLabelText(/client secret/i) as HTMLInputElement;
    const saveButton = screen.getByRole("button", { name: /save credentials/i }) as HTMLButtonElement;
    expect(idInput).toBeTruthy();
    expect(secretInput).toBeTruthy();

    // Save is disabled until both fields are filled.
    expect(saveButton.disabled).toBe(true);
    fireEvent.change(idInput, { target: { value: "111111111111-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com" } });
    fireEvent.change(secretInput, { target: { value: "GOCSPX-abc123" } });
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);
    await waitFor(() =>
      expect((window as any).electronDB.googleSetCredentials).toHaveBeenCalledWith({
        clientId: "111111111111-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com",
        clientSecret: "GOCSPX-abc123",
      })
    );
  });

  it("offers sign-in when configured but not signed in, and uploads after sign-in", async () => {
    const db = (window as any).electronDB;
    db.googleStatus
      .mockResolvedValueOnce({ configured: true, signedIn: false }) // on mount
      .mockResolvedValueOnce({ configured: true, signedIn: true }); // after sign-in
    db.googleSignIn.mockResolvedValue({ success: true });
    db.googleUploadBackup.mockResolvedValue({
      success: true,
      name: "manufacturing-erp-backup-2026-11-12.merpbak",
      webViewLink: "https://drive.google.com/file/d/1abc/view",
    });

    render(<BackupRestoreTab />);

    const signInButton = await screen.findByRole("button", { name: /sign in with google/i });
    fireEvent.click(signInButton);
    await waitFor(() => expect(db.googleSignIn).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith("Signed in to Google");

    const uploadButton = await screen.findByRole("button", { name: /backup to drive/i });
    fireEvent.click(uploadButton);
    await waitFor(() => expect(db.googleUploadBackup).toHaveBeenCalledTimes(1));
    expect(toastSuccess).toHaveBeenCalledWith(
      "Backup uploaded to Google Drive",
      expect.objectContaining({ description: "manufacturing-erp-backup-2026-11-12.merpbak" })
    );
  });

  it("lists the Drive backups when Restore from Drive is opened", async () => {
    const db = (window as any).electronDB;
    db.googleStatus.mockResolvedValue({ configured: true, signedIn: true });

    render(<BackupRestoreTab />);
    const restoreButton = await screen.findByRole("button", { name: /restore from drive/i });
    fireEvent.click(restoreButton);

    await waitFor(() => expect(db.googleListBackups).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/manufacturing-erp-backup-2026-11-11\.merpbak/i)).toBeTruthy();
    expect(screen.findByText(/2026-10-30\.merpbak/i)).toBeTruthy();
  });

  it("restores the selected backup from Drive after confirmation", async () => {
    const db = (window as any).electronDB;
    db.googleStatus.mockResolvedValue({ configured: true, signedIn: true });

    render(<BackupRestoreTab />);
    fireEvent.click(await screen.findByRole("button", { name: /restore from drive/i }));
    await screen.findByText(/manufacturing-erp-backup-2026-11-11\.merpbak/i);

    const restoreButtons = await screen.findAllByRole("button", { name: "Restore" });
    fireEvent.click(restoreButtons[0]);

    // The confirmation dialog shows, and no restore happens yet.
    expect(await screen.findByText(/restore this backup from drive\?/i)).toBeTruthy();
    expect(db.googleRestoreBackup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /download and restore/i }));
    await waitFor(() => expect(db.googleRestoreBackup).toHaveBeenCalledWith("drive-file-1"));
    expect(clearStorageMirrors).toHaveBeenCalledTimes(1);
  });

  it("cancelling the restore keeps everything alone", async () => {
    const db = (window as any).electronDB;
    db.googleStatus.mockResolvedValue({ configured: true, signedIn: true });

    render(<BackupRestoreTab />);
    fireEvent.click(await screen.findByRole("button", { name: /restore from drive/i }));
    await screen.findByText(/manufacturing-erp-backup-2026-11-11\.merpbak/i);

    const restoreButtons = await screen.findAllByRole("button", { name: "Restore" });
    fireEvent.click(restoreButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(db.googleRestoreBackup).not.toHaveBeenCalled();
    expect(clearStorageMirrors).not.toHaveBeenCalled();
  });

  it("surfaces a failed upload instead of pretending it worked", async () => {
    const db = (window as any).electronDB;
    db.googleStatus.mockResolvedValue({ configured: true, signedIn: true });
    db.googleUploadBackup.mockResolvedValue({ success: false, error: "Upload failed (HTTP 403)." });

    render(<BackupRestoreTab />);

    const uploadButton = await screen.findByRole("button", { name: /backup to drive/i });
    fireEvent.click(uploadButton);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toBe("Upload failed");
    expect(toastError.mock.calls[0][1].description).toContain("403");
    expect(toastSuccess).not.toHaveBeenCalledWith("Backup uploaded to Google Drive");
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
