// Poll a GitHub Actions run until it completes (or a deadline passes).
// Usage: node scripts/poll-release.cjs <run-id> [max-minutes]
const TOKEN = process.env.GH_PAT || process.env.GITHUB_TOKEN;
const runId = process.argv[2];
const maxMinutes = Number(process.argv[3] || 45);
if (!TOKEN || !runId) {
  console.error('usage: node scripts/poll-release.cjs <run-id> [max-minutes]');
  process.exit(2);
}
const url = `https://api.github.com/repos/beingadil/manufacturing-erp/actions/runs/${runId}`;
const start = Date.now();
const deadline = start + maxMinutes * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getRun() {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return res.json();
}

(async () => {
  for (;;) {
    const w = await getRun();
    const elapsed = Math.round((Date.now() - start) / 60000);
    console.log(`[${new Date().toISOString()}] status=${w.status} conclusion=${w.conclusion || '-'} elapsed=${elapsed}m`);
    if (w.status === 'completed') {
      console.log(`FINAL: ${w.conclusion}`);
      process.exit(w.conclusion === 'success' ? 0 : 1);
    }
    if (Date.now() > deadline) {
      console.log('TIMEOUT: still running after deadline');
      process.exit(3);
    }
    await sleep(120000);
  }
})();
