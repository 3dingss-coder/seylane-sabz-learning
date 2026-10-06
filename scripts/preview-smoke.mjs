// Preview smoke test. Usage: node scripts/preview-smoke.mjs https://<preview-host>
// Only ever point this at the PREVIEW Worker. Emits GitHub ::notice:: lines with real numbers.
const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base || /academy-seylaneh\.site/.test(base)) {
  console.error('refusing: pass the preview URL (never production)');
  process.exit(2);
}
const lines = [];
const out = (m) => { lines.push(m); console.log(m); };
const flush = () => console.log(`::notice title=smoke::${lines.join('%0A')}`);
let errors4 = 0, errors5 = 0, failed = false;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function call(method, path, body, token, extra = {}) {
  const t0 = performance.now();
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - t0;
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch {}
  if (res.status >= 500) errors5++; else if (res.status >= 400) { errors4++; lines.push(`4xx: ${method} ${path} -> ${res.status} ${text.slice(0, 120)}`); }
  return { status: res.status, ms, json, headers: res.headers, text };
}
const check = (name, ok, detail = '') => { out(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`); if (!ok) failed = true; };

// wait for the Worker to answer
let h;
for (let i = 0; i < 15; i++) { h = await call('GET', '/v1/health'); if (h.status === 200) break; await new Promise((r) => setTimeout(r, 4000)); }
out(`health body: ${h.text.slice(0, 400)}`);
check('health 200', h.status === 200, `status=${h.status} ${h.ms.toFixed(0)}ms`);
check('health backend=d1', h.json?.data?.backend === 'd1');
check('health dependencies.d1', h.json?.data?.dependencies?.d1 === true);
check('health dependencies.r2', h.json?.data?.dependencies?.r2 === true);
check('health no key length leak', !/KeyLength|KeyHasWhitespace/.test(h.text));
check('health no-store', /no-store/.test(h.headers.get('cache-control') || ''));
const deep = await call('GET', '/v1/health?deep=1');
check('health deep 200', deep.status === 200, `${deep.ms.toFixed(0)}ms`);

const run = Date.now().toString().slice(-7);
const regT = [], logT = [], refT = [], homeT = [], pkgT = [], healthT = [];
let tokens;
const N = 12;
for (let i = 0; i < N; i++) {
  const phone = `09${run}0${i}`;
  const pw = 'PreviewPass123!';
  const r = await call('POST', '/v1/auth/register', { name: `Preview User ${i}`, identifier: phone, password: pw });
  regT.push(r.ms);
  if (i === 0) out(`register sample: status=${r.status} ${r.text.slice(0, 300).replace(/"(idToken|refreshToken)":"[^"]+"/g, '"$1":"***"')}`);
  const l = await call('POST', '/v1/auth/login', { identifier: phone, password: pw });
  logT.push(l.ms);
  if (i === 0) tokens = l.json?.data ?? l.json;
  const hh = await call('GET', '/v1/health'); healthT.push(hh.ms);
  if (i === 0 && r.status !== 201) check('register 201', false, `status=${r.status}`);
  if (i === 0 && l.status !== 200) check('login 200', false, `status=${l.status}`);
}
const idToken = tokens?.idToken, refreshToken = tokens?.refreshToken;
check('login returned tokens', Boolean(idToken && refreshToken));
for (let i = 0; i < N; i++) {
  const rf = await call('POST', '/v1/auth/refresh', { refreshToken }); refT.push(rf.ms);
  if (i === 0) check('refresh 200', rf.status === 200, `status=${rf.status}`);
  const hm = await call('GET', '/v1/me/home', null, idToken); homeT.push(hm.ms);
  if (i === 0) check('me/home 200', hm.status === 200, `status=${hm.status} cache-control=${hm.headers.get('cache-control')}`);
  const pk = await call('GET', '/v1/me/packages', null, idToken); pkgT.push(pk.ms);
}
const me = await call('GET', '/v1/me', null, idToken);
const cc = (me.headers.get('cache-control') || '') + '|' + (me.headers.get('cdn-cache-control') || '');
check('user-specific response not publicly cacheable', !/public|s-maxage/.test(cc), `cache-control=${cc}`);
for (const [n, a] of [['register', regT], ['login', logT], ['refresh', refT], ['me/home', homeT], ['me/packages', pkgT], ['health', healthT]]) {
  out(`latency ${n}: n=${a.length} p50=${pct(a, 0.5).toFixed(0)}ms p95=${pct(a, 0.95).toFixed(0)}ms max=${Math.max(...a).toFixed(0)}ms`);
}
check('register p95 < 2000ms', pct(regT, 0.95) < 2000);
check('login p95 < 2000ms', pct(logT, 0.95) < 2000);

// ---- media Range (via a marketer-visible section, if the seed has file-based media) ----
try {
  const pk = await call('GET', '/v1/me/packages', null, idToken);
  const pkgs = JSON.stringify(pk.json ?? {});
  const pkgIds = [...new Set([...pkgs.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]))].slice(0, 12);
  const secIds = [];
  for (const id of pkgIds) {
    const d = await call('GET', `/v1/me/packages/${id}`, null, idToken);
    if (d.status !== 200) continue;
    for (const m of JSON.stringify(d.json).matchAll(/"sectionId":"([^"]+)"|"id":"(sec[^"]*|s_[^"]+)"/g)) secIds.push(m[1] || m[2]);
    if (secIds.length > 20) break;
  }
  out(`media: packages scanned=${pkgIds.length} section candidates=${[...new Set(secIds)].length}`);
  let done = false;
  for (const sid of [...new Set(secIds)].slice(0, 20)) {
    const m = await call('GET', `/v1/me/sections/${sid}/media`, null, idToken);
    const data = m.json?.data;
    if (m.status === 200 && data?.source === 'file' && data.url) {
      const url = data.url.startsWith('http') ? data.url : base + data.url;
      const r = await fetch(url, { headers: { Range: 'bytes=0-1023' } });
      const buf = await r.arrayBuffer();
      out(`media Range: status=${r.status} accept-ranges=${r.headers.get('accept-ranges')} content-range=${r.headers.get('content-range')} bytes=${buf.byteLength} cache-control=${r.headers.get('cache-control')}`);
      check('media Range 206', r.status === 206 && /^bytes 0-/.test(r.headers.get('content-range') || ''));
      check('signed media not public-cacheable', !/public/.test(r.headers.get('cache-control') || ''));
      done = true; break;
    }
  }
  if (!done) out('media Range: NOT TESTED (no unlocked file-based section reachable by a new marketer)');
} catch (e) { out(`media Range: error ${e}`); }

const bad = await call('POST', '/v1/auth/login', { identifier: '09000000000', password: 'wrongpass' });
check('bad login is 4xx not 5xx', bad.status >= 400 && bad.status < 500, `status=${bad.status}`);
out(`errors observed: 4xx=${errors4} 5xx=${errors5}`);
check('no 5xx during smoke', errors5 === 0);
flush();
process.exit(failed ? 1 : 0);
