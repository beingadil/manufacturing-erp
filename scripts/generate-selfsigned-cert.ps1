# scripts/generate-selfsigned-cert.ps1
#
# Generates a SELF-SIGNED code-signing certificate and exports it to a PFX
# for LOCAL TESTING of the signing pipeline ONLY.
#
# ⚠️ IMPORTANT: A self-signed cert does NOT remove the Windows SmartScreen
# "unknown publisher" warning for end users. Use Azure Trusted Signing or a
# public CA cert for production. See CODE_SIGNING.md.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\generate-selfsigned-cert.ps1
#
# Outputs:
#   certs\manufacturing-erp-selfsigned.pfx   (gitignored — contains private key)
#   and prints the PFX password to use as CSC_KEY_PASSWORD.

[CmdletBinding()]
param(
    [string]$OutputDir = '',
    [string]$Subject = 'CN=Manufacturing ERP (Self-Signed Test)',
    [string]$PfxName = 'manufacturing-erp-selfsigned.pfx',
    [string]$PfxPassword = ( -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object { [char]$_ }) )
)

$ErrorActionPreference = 'Stop'

# $PSScriptRoot is unreliable inside param() defaults — resolve after binding.
if (-not $OutputDir) {
    $OutputDir = Join-Path $PSScriptRoot '..\certs'
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

Write-Host 'Generating self-signed code-signing certificate...' -ForegroundColor Cyan

# Create the cert in the CurrentUser My store, code-signing EKU, exportable key.
$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $Subject `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyExportPolicy Exportable `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -NotAfter (Get-Date).AddYears(2)

try {
    $securePassword = ConvertTo-SecureString -String $PfxPassword -Force -AsPlainText
    $pfxPath = Join-Path $OutputDir $PfxName
    Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePassword | Out-Null

    Write-Host ''
    Write-Host '✅ Self-signed PFX created:' -ForegroundColor Green
    Write-Host "   $pfxPath"
    Write-Host ''
    Write-Host 'Use it locally with:' -ForegroundColor Yellow
    Write-Host "   `$env:CSC_LINK = '$pfxPath'"
    Write-Host "   `$env:CSC_KEY_PASSWORD = '$PfxPassword'"
    Write-Host '   npm run electron:build:win'
    Write-Host ''
    Write-Host '⚠️  This is for TESTING only — SmartScreen still warns end users.' -ForegroundColor DarkYellow
    Write-Host '    Use Azure Trusted Signing or a public CA cert for production.' -ForegroundColor DarkYellow
} finally {
    # Remove the cert from the personal store (the PFX file is the artifact).
    Remove-Item -Path "Cert:\CurrentUser\My\$($cert.Thumbprint)" -Force -ErrorAction SilentlyContinue
}
