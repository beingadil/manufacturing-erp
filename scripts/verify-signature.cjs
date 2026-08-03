#!/usr/bin/env node
/**
 * scripts/verify-signature.cjs
 *
 * Verifies the Authenticode signature of a built Windows installer/exe using
 * PowerShell's Get-AuthenticodeSignature.
 *
 * Usage:
 *   node scripts/verify-signature.cjs <path-to-exe>
 *   node scripts/verify-signature.cjs <directory>   # newest "Manufacturing ERP Setup *.exe"
 *   node scripts/verify-signature.cjs               # same, defaults to dist-electron
 *
 * Exit codes:
 *   0  = signature Valid
 *   1  = NotSigned (or chain not trusted) — SmartScreen will warn
 *   2  = error (file missing, PowerShell unavailable, etc.)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findNewestInstaller(dir) {
  // Match both "Manufacturing ERP Setup 1.0.5.exe" and the hyphenated
  // "Manufacturing-ERP-Setup-1.0.5.exe" artifact naming. Separators between
  // words and before the version may be a space, a hyphen, or nothing.
  const candidates = fs
    .readdirSync(dir)
    .filter((f) => /^Manufacturing[ -]?ERP[ -]?Setup[ -]?.+\.exe$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return candidates[0] || null;
}

let target = process.argv[2] || 'dist-electron';
let abs = path.resolve(target);

// If given a directory (or the default), pick the newest setup installer.
if (!abs.toLowerCase().endsWith('.exe') && fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
  const newest = findNewestInstaller(abs);
  if (!newest) {
    console.error(`❌ No "Manufacturing ERP Setup *.exe" found in ${abs}`);
    process.exit(2);
  }
  abs = newest;
}

if (!fs.existsSync(abs)) {
  console.error(`❌ File not found: ${abs}`);
  process.exit(2);
}

// PowerShell returns the signature status for the file. We use a here-string
// quoted with single quotes so no PS variable expansion interferes.
const psScript = `
$ErrorActionPreference = 'Stop'
$sig = Get-AuthenticodeSignature -FilePath '${abs.replace(/'/g, "''")}'
$subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '' }
[PSCustomObject]@{
  Status = $sig.Status.ToString()
  Subject = $subject
} | ConvertTo-Json -Compress
`;

let out;
try {
  out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
    encoding: 'utf8',
    timeout: 30000,
  }).trim();
} catch (e) {
  console.error('❌ Could not run PowerShell to verify signature.');
  console.error(`   ${e.message}`);
  process.exit(2);
}

let result;
try {
  result = JSON.parse(out);
} catch (e) {
  console.error('❌ Unexpected PowerShell output:');
  console.error(out);
  process.exit(2);
}

const fileName = path.basename(abs);
console.log(`\n🔏 Signature check — ${fileName}`);
console.log(`   Status : ${result.Status}`);
if (result.Subject) console.log(`   Subject: ${result.Subject}`);
console.log('');

if (result.Status === 'Valid') {
  console.log('✅ Signature is VALID — SmartScreen should show a verified publisher.');
  process.exit(0);
} else if (result.Status === 'NotSigned') {
  console.log('⚠️  File is NOT SIGNED — users will see the "unknown publisher" warning.');
  console.log('    See CODE_SIGNING.md to set up Azure Trusted Signing or a CA cert.');
  process.exit(1);
} else {
  console.log(`❌ Signature status "${result.Status}" is not trusted — the warning will show.`);
  process.exit(1);
}
