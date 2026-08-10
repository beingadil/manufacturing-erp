// Boot-check helper: connects to a running Electron app's DevTools port and
// reports the rendered DOM state so we can confirm the app paints (no loader,
// no white screen) instead of guessing.
const http = require('http');

function getTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', (res) => {
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
    }, 10000);
    ws.onopen = () =>
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
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

(async () => {
  const targets = await getTargets();
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.log('NO_PAGE_TARGET'); process.exit(1); }
  console.log('URL:', page.url);
  const res = await evalInPage(
    page.webSocketDebuggerUrl,
    `JSON.stringify({
      rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,
      hasLoader: !!document.getElementById('startup-loader'),
      hasSpinner: !!document.querySelector('.spinner, [class*="animate-spin"]'),
      bodyText: (document.body.innerText || '').slice(0, 300),
      title: document.title
    })`
  );
  console.log('DOM:', res && res.result && res.result.value);
})();
