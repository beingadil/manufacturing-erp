#!/usr/bin/env node
/**
 * Updates (or creates) the GitHub release body for a tag.
 *
 * Strategy: electron-builder may race the release creation by uploading
 *   .blockmap and .exe as two parallel publish calls, each creating a
 *   duplicate release for the tag. This script:
 *   1. Lists ALL releases with the given tag.
 *   2. Keeps the one with the most assets and MOVES any asset the others
 *      carry onto it — deleting a duplicate release deletes its assets too,
 *      and that is how the .blockmap went missing from a release.
 *   3. Deletes the duplicates that are now empty.
 *   4. PATCH name + body onto the surviving release.
 *   5. If none exists, POST create one.
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

// GitHub has no "move asset between releases" API, so the bytes are
// downloaded and re-uploaded onto the surviving release.
async function moveAsset(asset, target) {
  const dl = await fetch(asset.url, { headers: { ...headers, Accept: 'application/octet-stream' } });
  if (!dl.ok) throw new Error(`download failed: ${dl.status}`);
  const bytes = Buffer.from(await dl.arrayBuffer());
  const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${target.id}/assets?name=${encodeURIComponent(asset.name)}`;
  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      Accept: 'application/vnd.github+json',
      'Content-Type': asset.content_type || 'application/octet-stream',
      'Content-Length': String(bytes.length),
    },
    body: bytes,
  });
  if (!up.ok) throw new Error(`upload failed: ${up.status} ${(await up.text()).slice(0, 200)}`);
  return (await getJson(up)).id;
}

async function main() {
  // 1. List releases for the repo, filter by tag.
  const listRes = await fetch(`${api}?per_page=100`, { headers });
  if (!listRes.ok) throw new Error(`list failed: ${listRes.status} ${await listRes.text()}`);
  const all = await getJson(listRes);
  const matching = Array.isArray(all) ? all.filter(r => r.tag_name === tag) : [];

  // 2. Pick the best release to update, and fold duplicates into it.
  let target = null;
  const ranked = matching.sort((a, b) => (b.assets?.length || 0) - (a.assets?.length || 0));
  if (ranked.length > 0) target = ranked[0];

  if (target && ranked.length > 1) {
    const dupes = ranked.slice(1);
    const targetNames = new Set((target.assets || []).map(a => a.name));
    for (const dup of dupes) {
      const dupAssets = dup.assets || [];
      // Every asset a duplicate carries is moved onto the surviving release
      // BEFORE the duplicate is deleted — deleting a release deletes its
      // assets with it. That is how the .blockmap went missing from a
      // release: the duplicate holding it was deleted, not merged.
      let merged = true;
      for (const asset of dupAssets) {
        if (targetNames.has(asset.name)) continue;
        if (dryRun) {
          console.log(`[dry-run] Would move asset ${asset.name} from release ${dup.id} to ${target.id}.`);
          continue;
        }
        try {
          await moveAsset(asset, target);
          targetNames.add(asset.name);
          console.log(`✓ Moved asset ${asset.name} from duplicate release ${dup.id} to ${target.id}.`);
        } catch (e) {
          // Keep the duplicate: its asset is the only copy left.
          merged = false;
          console.error(`  ⚠ Could not move asset ${asset.name} from release ${dup.id}: ${e.message}`);
        }
      }
      if (dryRun) {
        console.log(`[dry-run] Would delete duplicate release ${dup.id} (${dup.assets?.length || 0} asset(s), target=${target.id}).`);
        continue;
      }
      if (!merged) {
        console.error(`  ⚠ Keeping duplicate release ${dup.id} — it still holds assets the target is missing.`);
        continue;
      }
      console.log(`⚠ Deleting duplicate release id=${dup.id} for ${tag} (${dupAssets.length} asset(s) moved to ${target.id}).`);
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
