#!/usr/bin/env node
/**
 * Updates (or creates) the GitHub release body for a tag.
 *
 * Usage:
 *   node scripts/update-release-body.mjs <owner/repo> <version> <bodyFile> [--dry-run]
 *
 * Requires GH_TOKEN or GITHUB_TOKEN in the environment.
 *   - Looks up the release by tag (GET /releases/tags/vX).
 *   - If it exists  → PATCH name + body.
 *   - If it does not exist → POST a new release (CI's electron-builder later
 *     uploads the installer assets to it).
 *   - --dry-run    → only prints what would happen (read-only).
 */
import fs from 'node:fs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const [repo, version, bodyFile] = args.filter((a) => a !== '--dry-run');

if (!repo || !version || !bodyFile) {
  console.error('Usage: node scripts/update-release-body.mjs <owner/repo> <version> <bodyFile> [--dry-run]');
  process.exit(1);
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  console.error('❌ GH_TOKEN or GITHUB_TOKEN environment variable must be set.');
  process.exit(1);
}

const body = fs.readFileSync(bodyFile, 'utf8').trim();
const tag = `v${version}`;
const api = `https://api.github.com/repos/${repo}/releases`;
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
};
const payload = { name: `Manufacturing ERP v${version}`, body };

async function main() {
  const getRes = await fetch(`${api}/tags/${tag}`, { headers });

  if (getRes.status === 404) {
    if (dryRun) {
      console.log(`[dry-run] Release ${tag} does not exist yet — would CREATE it with a ${body.length}-char changelog.`);
      return;
    }
    const createRes = await fetch(api, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tag_name: tag, ...payload }),
    });
    if (!createRes.ok) throw new Error(`create failed: ${createRes.status} ${await createRes.text()}`);
    const created = await createRes.json();
    console.log(`✅ Created release ${created.html_url}`);
    return;
  }

  if (!getRes.ok) throw new Error(`lookup failed: ${getRes.status} ${await getRes.text()}`);
  const release = await getRes.json();

  if (dryRun) {
    console.log(`[dry-run] Release ${tag} exists (id ${release.id}) — would UPDATE name + ${body.length}-char changelog body.`);
    return;
  }

  const patchRes = await fetch(`${api}/${release.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(payload),
  });
  if (!patchRes.ok) throw new Error(`update failed: ${patchRes.status} ${await patchRes.text()}`);
  const updated = await patchRes.json();
  console.log(`✅ Updated release ${updated.html_url}`);
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
