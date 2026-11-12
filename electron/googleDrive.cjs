// Google Drive backup upload — one tap uploads today's .merpbak to Drive.
//
// ─── Setup (one time, ~10 minutes, free) ────────────────────────────────────
//
//   1. Google Cloud Console  →  Create Project (e.g. "Manufacturing ERP")
//   2. APIs & Services  →  Enable APIs  →  Google Drive API
//   3. APIs & Services  →  OAuth consent screen  →  External, your email as a
//      TEST user  →  scopes: drive.file only (non-sensitive, nothing to pay)
//   4. APIs & Services  →  Credentials  →  Create Credentials  →
//      OAuth client ID  →  Application type: DESKTOP app
//   5. Paste the two values below (PASTE_CLIENT_ID_HERE / PASTE_CLIENT_SECRET_HERE).
//
// The OAuth credentials are DESKTOP-client credentials: per Google's rules they
// are not treated as confidential (the app still uses a PKCE-less loopback flow
// and signs in with your own account). The refresh token is stored in the app's
// userData directory, encrypted with safeStorage when available.
//
// Everything here talks to Google over HTTPS using Node's built-in fetch —
// no third-party dependency, nothing to audit, no SDK surface to maintain.
//
// Scope is drive.file only: the app can see and manage ONLY the files it
// creates in Drive (the backups themselves, in the "Manufacturing ERP Backups"
// folder). It cannot read, list or touch anything else in your Drive.
//
// Retention: nothing is ever deleted. Older backups stay in Drive forever.

'use strict';

const { app, BrowserWindow, safeStorage } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

// ─── Google OAuth credentials ────────────────────────────────────────────────
// NOT stored in git — GitHub push protection refuses to let OAuth client values
// near the repo, and we do not want them there anyway. They are pasted once per
// machine via Settings → System Maintenance → Backup & Restore → Google Drive
// Backup → "Paste your Client ID and Client secret", and are saved in the app's
// userData directory (google-drive.json) on that machine.
//
// Project: "Manufacturing ERP" in Google Cloud. Scope: drive.file (non-sensitive).
// The signed-in user must be listed as a test user in the OAuth consent screen.

const FOLDER_NAME = 'Manufacturing ERP Backups';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const configPath = () => path.join(app.getPath('userData'), 'google-drive.json');
const backupsDir = () => {
  const dir = path.join(app.getPath('userData'), 'drive-backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const current = readConfig();
  const next = { ...current, ...patch };
  // Never leave an explicitly undefined value in the file.
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), { mode: 0o600 });
}

function encryptToken(token) {
  if (safeStorage.isEncryptionAvailable()) {
    return { refreshToken: safeStorage.encryptString(token).toString('base64'), encrypted: true };
  }
  // safeStorage is unavailable (no keyring on this machine) — keep the token but
  // be honest about it by marking it unencrypted instead of pretending.
  console.warn('[google-drive] safeStorage is unavailable; storing refresh token unencrypted in userData');
  return { refreshToken: token, encrypted: false };
}

function readRefreshToken() {
  const { refreshToken, encrypted } = readConfig();
  if (!refreshToken) return null;
  if (encrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(refreshToken, 'base64'));
    } catch {
      return null;
    }
  }
  return refreshToken;
}

// Credentials read from the machine, not hard-coded. Returns null until the user
// pastes both into Settings → Backup & Restore → Google Drive Backup.
function readCredentials() {
  const { clientId, clientSecret } = readConfig();
  if (typeof clientId === 'string' && typeof clientSecret === 'string') {
    const id = clientId.trim();
    const secret = clientSecret.trim();
    if (id.length > 20 && secret.length > 10) return { clientId: id, clientSecret: secret };
  }
  return null;
}

const isConfigured = () => readCredentials() !== null;
const isSignedIn = () => !!readRefreshToken();

// Called from the "Save credentials" button in the renderer — validates shape,
// writes them to userData, nothing else.
function setCredentials({ clientId, clientSecret }) {
  const id = String(clientId || '').trim();
  const secret = String(clientSecret || '').trim();
  if (!id || !secret) return { success: false, error: 'Both the Client ID and the Client secret are required.' };
  if (!id.includes('.apps.googleusercontent.com')) {
    return { success: false, error: 'The Client ID should end with .apps.googleusercontent.com — check you copied the whole thing.' };
  }
  if (!secret.startsWith('GOCSPX-')) {
    return { success: false, error: 'The Client secret starts with GOCSPX- — check you copied the whole thing.' };
  }
  writeConfig({ clientId: id, clientSecret: secret });
  return { success: true };
}

function clearCredentials() {
  writeConfig({ clientId: undefined, clientSecret: undefined, refreshToken: undefined, encrypted: undefined, folderId: undefined, signedInAt: undefined });
  return { success: true };
}

function getStatus() {
  if (!isConfigured()) {
    return {
      configured: false,
      signedIn: false,
      folderName: FOLDER_NAME,
      message: 'Paste your Google OAuth credentials in Settings → System Maintenance → Backup & Restore.',
    };
  }
  return {
    configured: true,
    signedIn: isSignedIn(),
    folderName: FOLDER_NAME,
    folderId: readConfig().folderId || null,
  };
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

const formBody = (data) => new URLSearchParams(data).toString();

async function postForm(data) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody(data),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // keep json null; caller reports the raw body
  }
  return { ok: response.ok, status: response.status, json, raw: text };
}

async function driveFetch(pathname, token, init = {}) {
  const response = await fetch(`${DRIVE_API}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore non-JSON responses
  }
  return { ok: response.ok, status: response.status, json, raw: text };
}

// ─── Sign-in (in-app Google window + loopback redirect) ─────────────────────

async function signIn() {
  const credentials = readCredentials();
  if (!credentials) {
    return { success: false, error: 'not-configured', message: 'Paste your Google OAuth credentials in Settings → System Maintenance → Backup & Restore.' };
  }
  const { clientId, clientSecret } = credentials;

  // A random free loopback port for the OAuth redirect URI.
  const port = await new Promise((resolve, reject) => {
    const probe = http.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
  const redirectUri = `http://127.0.0.1:${port}`;

  const authUrl = `${AUTH_ENDPOINT}?${new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  }).toString()}`;

  const parent = BrowserWindow.getAllWindows()[0] || undefined;
  const authWindow = new BrowserWindow({
    width: 520,
    height: 720,
    parent,
    modal: true,
    autoHideMenuBar: true,
    title: 'Sign in to Google',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const finished = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/' || !url.searchParams.has('code')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><meta charset="utf-8"><title>Signed in</title></head>' +
        '<body style="font-family:system-ui;text-align:center;padding:3rem"><h1>Signed in</h1>' +
        '<p>You can close this window and go back to the app.</p></body></html>');
      const code = url.searchParams.get('code');
      const errorParam = url.searchParams.get('error');
      server.close();
      if (code) resolve(code);
      else reject(new Error(errorParam || 'Google did not return an authorization code.'));
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1');

    authWindow.on('closed', () => {
      server.close();
      reject(new Error('Sign-in window was closed before sign-in completed.'));
    });
  });

  authWindow.loadURL(authUrl);

  let code;
  try {
    code = await finished;
  } catch (error) {
    if (!authWindow.isDestroyed()) authWindow.close();
    return { success: false, error: error.message };
  }
  if (!authWindow.isDestroyed()) authWindow.close();

  const exchanged = await postForm({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (!exchanged.ok || !exchanged.json) {
    return {
      success: false,
      error: `Google refused the token request (HTTP ${exchanged.status}). ${exchanged.raw || ''}`.trim(),
    };
  }
  if (!exchanged.json.refresh_token) {
    // access_type=offline + prompt=consent should always produce one; if it does not,
    // the account already granted access earlier and Google did not re-issue a refresh token.
    return {
      success: false,
      error: 'Google did not return a refresh token. In Google Account → Security → Third-party apps, remove the app and sign in again.',
    };
  }
  writeConfig(encryptToken(exchanged.json.refresh_token));
  writeConfig({ signedInAt: new Date().toISOString() });
  return { success: true };
}

function signOut() {
  writeConfig({ refreshToken: undefined, encrypted: undefined, folderId: undefined, signedInAt: undefined });
  return { success: true };
}

// ─── Access token (refresh on demand) ───────────────────────────────────────

async function getAccessToken() {
  const credentials = readCredentials();
  if (!credentials) return null;
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;
  const response = await postForm({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  if (!response.ok || !response.json || !response.json.access_token) {
    // 400/401 means the refresh token was revoked or expired — drop it so the UI offers sign-in again.
    if (response.status === 400 || response.status === 401) {
      writeConfig({ refreshToken: undefined, encrypted: undefined });
    }
    return null;
  }
  return response.json.access_token;
}

// ─── Drive folder + upload ──────────────────────────────────────────────────

async function getOrCreateFolderId(token) {
  const existing = readConfig().folderId;
  if (existing) return existing;

  const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed = false`);
  const found = await driveFetch(`/files?q=${query}&fields=files(id,name)&pageSize=1`, token);
  if (found.ok && found.json?.files?.length > 0) {
    writeConfig({ folderId: found.json.files[0].id });
    return found.json.files[0].id;
  }

  const created = await driveFetch('/files', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  if (!created.ok || !created.json?.id) {
    throw new Error(`Could not create the Drive folder (HTTP ${created.status}). ${created.raw || ''}`);
  }
  writeConfig({ folderId: created.json.id });
  return created.json.id;
}

function uniquePath(target) {
  if (!fs.existsSync(target)) return target;
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const stem = path.basename(target, ext);
  let counter = 2;
  let candidate = `${path.join(dir, stem)}-${counter}${ext}`;
  while (fs.existsSync(candidate)) {
    counter += 1;
    candidate = `${path.join(dir, stem)}-${counter}${ext}`;
  }
  return candidate;
}

async function uploadFile(filePath, token) {
  const folderId = await getOrCreateFolderId(token);
  // Google requires a multipart upload for metadata + content in one request.
  const boundary = `erp-drive-upload-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const fileName = path.basename(filePath);
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const fileBytes = fs.readFileSync(filePath);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webViewLink,createdTime`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: Buffer.concat([head, fileBytes, tail]),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // reported below
  }
  if (!response.ok || !json?.id) {
    throw new Error(`Upload failed (HTTP ${response.status}). ${text || ''}`.trim());
  }
  return { id: json.id, name: json.name || fileName, webViewLink: json.webViewLink || null, createdTime: json.createdTime || null };
}

async function uploadTodayBackup() {
  if (!isConfigured()) {
    return { success: false, error: 'not-configured', message: 'Paste your Google OAuth credentials in Settings → System Maintenance → Backup & Restore.' };
  }
  const token = await getAccessToken();
  if (!token) {
    return { success: false, error: 'not-signed-in', message: 'Sign in to Google first.' };
  }

  // Today's backup, named like the other backup modes. Never overwrite — a
  // second click on the same day gets a -2/-3 suffix, keeping every copy.
  const stamp = new Date().toISOString().slice(0, 10);
  const target = uniquePath(path.join(backupsDir(), `manufacturing-erp-backup-${stamp}.merpbak`));

  // database.cjs is a singleton — requiring it here gets the same instance main.cjs uses.
  const db = require('./database.cjs');
  const exported = db.exportUnifiedBackupToPath(target);
  if (!exported || !exported.success) {
    return { success: false, error: (exported && exported.error) || 'Could not create the backup file. Nothing was uploaded.' };
  }

  try {
    const uploaded = await uploadFile(target, token);
    return { success: true, filePath: target, ...uploaded };
  } catch (error) {
    // Keep the local copy regardless — the backup still exists on disk.
    return { success: false, error: error.message, filePath: target };
  }
}

module.exports = {
  getStatus,
  isConfigured,
  isSignedIn,
  setCredentials,
  clearCredentials,
  signIn,
  signOut,
  uploadTodayBackup,
};
