# Code Signing for Manufacturing ERP (Windows)

This guide explains how to sign the installer so Windows SmartScreen stops
warning users about an "unknown publisher" on every install/update.

---

## ⚠️ The most important thing to know

**A self-signed certificate does NOT stop SmartScreen warnings.**

Windows only trusts signatures from public Certificate Authorities (CAs) or
Microsoft's own trusted roots. A self-signed cert makes the app say
"verified publisher: unknown" — the warning stays, just with different text.
There are exactly **two ways** to remove the SmartScreen warning:

| Option | SmartScreen result | Cost | Effort |
|---|---|---|---|
| **Azure Trusted Signing** (recommended) | ✅ Removed over time (Microsoft-rooted trust) | ~$9.99/mo (5,000 sigs/mo tier) | 20–30 min Azure setup |
| **Public CA certificate** (Sectigo/DigiCert OV/EV) | ✅ Removed over time (trusted root) | ~$150–400/yr + hardware/HSM | Days (vetting + HSM) |
| Self-signed cert | ❌ Warning stays | Free | Minutes |

Also note: **even with a valid signature**, SmartScreen shows a warning for
new apps/publishers until enough people install it (reputation builds over
time). Signing fixes the "unknown publisher" part immediately; the volume
warning fades with adoption.

---

## Recommended path: Azure Trusted Signing

Azure Trusted Signing signs with Microsoft's trusted root, so no hardware
token is required and it works fully in CI (GitHub Actions). electron-builder
25.1+ has **native support** via `win.azureSignOptions`.

### 1. Create the Azure resources (once)

1. Create an **Azure subscription** (free tier works for setup).
2. Create a **Resource Group**.
3. Create a **Trusted Signing** resource (SKU: Standard).
4. Create a **Certificate Profile** of type **Public Trust** (this is the one
   that fixes SmartScreen — "Private Trust" is for internal apps only).
5. Create an **App Registration** (service principal) with a **client secret**.
6. Assign the service principal the role
   **Trusted Signing Certificate Profile Signer** on the certificate profile.
7. Copy these values from the Azure portal:
   - **Endpoint** — shown in the Trusted Signing resource overview
     (e.g. `https://<account>.<region>.codesigning.azure.net/` or
     `https://<region>.codesigning.azure.net/`)
   - **Trusted Signing Account Name**
   - **Certificate Profile Name**
   - **Certificate Name** (display name of the cert profile)

### 2. Configure the build

electron-builder reads signing config from `build.win` in `package.json`.
Add the Azure block (values from step 1):

```json
{
  "build": {
    "win": {
      "azureSignOptions": {
        "endpoint": "https://<your-endpoint>/",
        "trustedSigningAccountName": "your-account-name",
        "certificateProfileName": "your-profile-name",
        "certificateName": "your-certificate-name"
      }
    }
  }
}
```

Credentials come from **environment variables** (electron-builder uses the
Azure Identity SDK under the hood):

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

> `azureSignOptions` must NOT be committed with real values unless you also
> always supply credentials — if credentials are missing, the build fails.
> The workflow in this repo adds it only when the endpoint secret exists.

### 3. Build signed

**Locally (PowerShell):**

```powershell
$env:AZURE_TENANT_ID = "..."
$env:AZURE_CLIENT_ID = "..."
$env:AZURE_CLIENT_SECRET = "..."
npm run electron:build:win
```

**In CI (GitHub Actions):** add these repository secrets, and the existing
`release.yml` automatically passes them to the electron-builder step:

- `AZURE_SIGNING_ENDPOINT`
- `AZURE_SIGNING_ACCOUNT`
- `AZURE_SIGNING_PROFILE`
- `AZURE_SIGNING_CERT`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

When `AZURE_SIGNING_ENDPOINT` is set, CI appends
`-c.win.azureSignOptions.*` to the electron-builder command so the exact
Azure config is injected without committing credentials.

---

## Alternative: public CA certificate (PFX)

If you already own an OV/EV code-signing cert, export it to a PFX and use
electron-builder's built-in `CSC_LINK` / `CSC_KEY_PASSWORD`:

**Locally:**

```powershell
$env:CSC_LINK = "C:\path\to\your-cert.pfx"   # or base64 of the pfx
$env:CSC_KEY_PASSWORD = "your-pfx-password"
npm run electron:build:win
```

**In CI:** add `CSC_LINK` and `CSC_KEY_PASSWORD` secrets — `release.yml`
passes them through automatically.

> Keep the `.pfx` OUT of the repository (it contains the private key).
> See the `certs/` entry in `.gitignore`.

---

## Self-signed cert — local testing only

Useful to test that the signing pipeline *works* (signature applied, tamper
detection, `Get-AuthenticodeSignature` shows a signature) — but remember the
SmartScreen warning will NOT disappear for end users.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-selfsigned-cert.ps1
```

This writes `certs\manufacturing-erp-selfsigned.pfx` and prints the
password. Then:

```powershell
$env:CSC_LINK = "C:\path\to\certs\manufacturing-erp-selfsigned.pfx"
$env:CSC_KEY_PASSWORD = "<printed password>"
npm run electron:build:win
```

---

## Verifying the signature

After a build, check the installer's Authenticode status:

```bash
node scripts/verify-signature.cjs "dist-electron/Manufacturing ERP Setup 1.0.5.exe"
```

Exit codes: `0` = Valid, `1` = NotSigned, `2` = error/file missing.

PowerShell equivalent (manual):

```powershell
Get-AuthenticodeSignature -FilePath "dist-electron\Manufacturing ERP Setup 1.0.5.exe"
```

You want `Status: Valid` and a publisher that is **not** "Unknown".

---

## Troubleshooting

- **`azureSignOptions` configured but build fails with auth error** — missing
  or wrong `AZURE_*` env vars. Verify tenant/client/secret and that the
  service principal has the **Trusted Signing Certificate Profile Signer** role.
- **Signature shows "Valid" but SmartScreen still warns** — normal for a new
  publisher; the warning disappears as install volume grows.
- **Build skipped signing entirely** — no `CSC_LINK` and no `azureSignOptions`
  → electron-builder signs nothing by design. That is expected until you add
  one of the two paths above.
