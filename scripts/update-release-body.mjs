#!/usr/bin/env node
/**
 * Updates (or creates) the GitHub release body for a tag.
 *
 * Strategy: electron-builder may race the release creation by uploading
 *   .blockmap and .exe as two parallel publish calls, each creating a
 *   duplicate release for the tag. This script:
 *   1. Lists ALL releases with the given tag.
 *   2. If more than one exists, keeps the one with assets (the full installer
 *      with latest.yml + .exe) and DELETES any empty duplicates.
 *   3. PATCH name + body onto the surviving release.
 *   4. If none exists, POST create one.
 *
 * Usage:
 *   node scripts/update-release-body.mjs <owner/repo> <version> <bodyFile> [--dry-run]
 *
 * Requires GH_TOKEN or GITHUB_TOKEN in the environment.
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
  console.error('✗ GH_TOKEN or GITHUB_TOKEN environment variable must be set.');
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

async function getJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid JSON ${res.status}: ${text.slice(0, 200)}`);
  }
}

async function main() {
  // 1. List releases for the repo, filter by tag.
  const listRes = await fetch(`${api}?per_page=100`, { headers });
  if (!listRes.ok) throw new Error(`list failed: ${listRes.status} ${await listRes.text()}`);
  const all = await getJson(listRes);
  const matching = Array.isArray(all) ? all.filter(r => r.tag_name === tag) : [];

  // 2. Pick the best release to update, and delete empty duplicates.
  let target = null;
  const ranked = matching.sort((a, b) => (b.assets?.length || 0) - (a.assets?.length || 0));
  if (ranked.length > 0) target = ranked[0];

  if (target && ranked.length > 1) {
    const empties = ranked.slice(1);
    for (const dup of empties) {
      const hasAssets = (dup.assets?.length || 0) > 0;
      if (dryRun) {
        console.log(`[dry-run] Releasing duplicate: ${dup.id} (${dup.tag_name}) with ${dup.assets?.length || 0} asset(s) — would delete it (target=${target.id}, ${target.assets?.length || 0} assets).`);
        continue;
      }
      console.log(`⚠ Deleting duplicate release id=${dup.id} for ${tag} (${hasAssets ? 'has assets — keep target instead' : 'no assets — leftover from publish race'})…`);
      const del = await fetch(`${api}/${dup.id}`, { method: 'DELETE', headers });
      if (!del.ok) {
        console.error(`  ⚠ Could not delete duplicate ${dup.id}: ${del.status} ${await del.text()} — continuing with ${target.id}.`);
      } else {
        console.log(`✓ Deleted duplicate release id=${dup.id}.`);
      }
    }
  }

  // 3. Update or create the surviving release.
  if (target) {
    if (dryRun) {
      console.log(`[dry-run] Release ${tag} exists (id ${target.id}) — would UPDATE name + body (${body.length} chars).`);
      return;
    }
    const patchRes = await fetch(`${api}/${target.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(payload),
    });
    if (!patchRes.ok) throw new Error(`update failed: ${patchRes.status} ${await patchRes.text()}`);
    const updated = await getJson(patchRes);
    console.log(`✓ Updated release ${updated.html_url}`);
    return;
  }

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
  const created = await getJson(createRes);
  console.log(`✓ Created release ${created.html_url}`);
}

main().catch((e) => {
  console.error(`✗ ${e.message}`);
  process.exit(1);
});
