// Verifies that a prod-mode Worker WITHOUT a D1 binding fails fast (no in-memory fallback).
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base || /academy-seylaneh\.site/.test(base)) { console.error('refusing'); process.exit(2); }
const lines = []; let failed = false;
const check = (n, ok, d = '') => { lines.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${d}`); if (!ok) failed = true; };
for (let i = 0; i < 10; i++) { const r = await fetch(base + '/v1/health'); if (r.status !== 404) break; await new Promise((x) => setTimeout(x, 3000)); }
const h = await fetch(base + '/v1/health'); const ht = await h.text();
check('no-DB health is 503 (not 200)', h.status === 503, `status=${h.status} body=${ht.slice(0, 160)}`);
const t0 = performance.now();
const r = await fetch(base + '/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'NoDb User', identifier: '09111111111', password: 'PreviewPass123!' }) });
const rt = await r.text();
check('no-DB register is 503, no fake success', r.status === 503, `status=${r.status} ${(performance.now() - t0).toFixed(0)}ms body=${rt.slice(0, 160)}`);
check('no-DB register body has retryable error, no tokens', !/idToken|refreshToken/.test(rt));
console.log(`::notice title=nodb::${lines.join('%0A')}`);
process.exit(failed ? 1 : 0);
