// Verifies the historical-postings fix inside a RUNNING app instance by
// querying its own key_value_store through the exposed electronDB IPC.
// Usage: node scripts/verify-migration.cjs [port]
const http = require('http');

const PORT = process.argv[2] || 9222;

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${PORT}/json`, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function evalInPage(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const t = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('eval timeout'));
    }, 15000);
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id === 1) {
        clearTimeout(t);
        try { ws.close(); } catch {}
        resolve(msg.result);
      }
    };
    ws.onerror = () => { clearTimeout(t); reject(new Error('websocket error')); };
  });
}

const EXPR = `
  window.electronDB.query({ id: 'mig-chk', sql: "SELECT value FROM key_value_store WHERE key='erp-storage'", params: [] })
    .then(r => {
      if (!r || !r.success) return JSON.stringify({ error: r && r.error ? r.error : 'query failed' });
      if (!r.data || !r.data[0]) return JSON.stringify({ error: 'no erp-storage row' });
      const parsed = JSON.parse(r.data[0].value);
      const st = parsed.state || parsed;
      const vouchers = st.vouchers || [];
      const entries = st.journalEntries || [];
      const accounts = st.accounts || [];
      const subtypes = st.accountSubtypes || [];
      const invSub = subtypes.find(s => s.name === 'Inventory');
      const rm = accounts.find(a => a.subtypeId === (invSub && invSub.id) && a.isSystem && a.name === 'Raw Material Inventory');
      const fg = accounts.find(a => a.subtypeId === (invSub && invSub.id) && a.isSystem && a.name === 'Finished Goods Inventory');
      const purchSub = subtypes.find(s => s.name === 'Purchases');
      const legacyCogs = accounts.find(a => a.subtypeId === (purchSub && purchSub.id) && a.isSystem);
      const cogsIds = new Set(accounts.filter(a => a.type === 'Cost of Goods Sold').map(a => a.id));

      const purchaseVouchers = vouchers.filter(v => v.sourceModule === 'Purchase');
      const salesVouchers = vouchers.filter(v => v.sourceModule === 'Sales');

      const purchaseDebitToRM = entries.filter(e =>
        e.debit > 0 && rm && e.accountId === rm.id
        && purchaseVouchers.some(v => v.id === e.voucherId)
      ).length;
      const purchaseDebitToLegacy = entries.filter(e =>
        e.debit > 0 && legacyCogs && e.accountId === legacyCogs.id
        && purchaseVouchers.some(v => v.id === e.voucherId)
      ).length;

      const salesWithCogs = salesVouchers.filter(v =>
        entries.some(e => e.voucherId === v.id && e.debit > 0 && cogsIds.has(e.accountId))
      ).length;
      const salesWithFg = salesVouchers.filter(v =>
        entries.some(e => e.voucherId === v.id && e.credit > 0 && fg && e.accountId === fg.id)
      ).length;

      return JSON.stringify({
        vouchers: vouchers.length,
        journalEntries: entries.length,
        accounts: accounts.length,
        purchaseVouchers: purchaseVouchers.length,
        purchaseDebitsOnRawMaterialInventory: purchaseDebitToRM,
        purchaseDebitsStillOnLegacyCOGS: purchaseDebitToLegacy,
        salesVouchers: salesVouchers.length,
        salesWithCOGSLeg: salesWithCogs,
        salesWithFinishedGoodsLeg: salesWithFg,
      });
    })
`;

(async () => {
  const targets = await getTargets();
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.log('NO_PAGE_TARGET'); process.exit(1); }
  const res = await evalInPage(page.webSocketDebuggerUrl, EXPR);
  console.log('MIGRATION CHECK:', res && res.result && res.result.value);
})();
