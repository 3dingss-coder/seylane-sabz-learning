'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../../functions/lib/app.js');
const { loadConfig } = require('../../functions/lib/config.js');
const { buildFirebaseDeps, buildMemoryDeps } = require('../../functions/lib/deps.js');
const { createPlaceholderMp4 } = require('../../functions/lib/seed/seed.js');
const seedSnapshot = require('../../functions/lib/seed-snapshot.json');

let serverPromise = null;

async function getServerPort() {
  if (!serverPromise) {
    serverPromise = (async () => {
      const hasFirebaseCreds = Boolean(
        process.env.FIREBASE_WEB_API_KEY &&
        process.env.STORAGE_BUCKET &&
        (process.env.GOOGLE_APPLICATION_CREDENTIALS ||
          process.env.GCLOUD_PROJECT ||
          process.env.FIRESTORE_EMULATOR_HOST),
      );
      const backend =
        process.env.DATA_BACKEND === 'firestore' && hasFirebaseCreds
          ? 'firestore'
          : process.env.DATA_BACKEND === 'memory' || !hasFirebaseCreds
            ? 'memory'
            : 'firestore';
      const dataDir =
        process.env.LOCAL_DATA_DIR || path.join(os.tmpdir(), 'seylane-sabz-netlify-data');

      if (backend === 'memory') {
        fs.mkdirSync(dataDir, { recursive: true });
        const dbFile = path.join(dataDir, 'db.json');
        if (!fs.existsSync(dbFile)) {
          fs.writeFileSync(dbFile, JSON.stringify(seedSnapshot));
        }
      }

      const config = loadConfig({
        ...process.env,
        DATA_BACKEND: backend,
        LOCAL_DATA_DIR: dataDir,
        PLAYBACK_BUDGET: process.env.PLAYBACK_BUDGET || 'off',
        RATE_LIMIT_SCALE: process.env.RATE_LIMIT_SCALE || '20',
      });

      const deps =
        backend === 'memory'
          ? buildMemoryDeps(config, { persist: true })
          : await buildFirebaseDeps(config);

      if (backend === 'memory') {
        for (const doc of Object.values(seedSnapshot.media || {})) {
          if (!doc || typeof doc !== 'object' || !doc.path) continue;
          if (!(await deps.blob.stat(doc.path))) {
            const isAudio = doc.kind === 'audio' || String(doc.path).includes('/audio/');
            const dur = Number(doc.durationSec) || (isAudio ? 420 : 540);
            await deps.blob.put(
              doc.path,
              createPlaceholderMp4(isAudio, dur),
              doc.mime || (isAudio ? 'audio/mp4' : 'video/mp4'),
            );
          }
        }
      }

      const app = createApp(deps);
      const server = http.createServer(app);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      server.unref();
      const addr = server.address();
      return typeof addr === 'object' && addr ? addr.port : 0;
    })();
  }
  return serverPromise;
}

function normalizePath(event) {
  let reqPath = event.path || '/';
  for (const prefix of ['/.netlify/functions/api', '/api']) {
    if (reqPath === prefix || reqPath.startsWith(`${prefix}/`)) {
      reqPath = reqPath.slice(prefix.length) || '/';
      break;
    }
  }
  if (!reqPath.startsWith('/v1') && event.rawUrl) {
    try {
      const u = new URL(event.rawUrl);
      if (u.pathname.startsWith('/v1')) reqPath = u.pathname;
    } catch {
      // ignore invalid rawUrl
    }
  }
  if (!reqPath.startsWith('/v1')) {
    reqPath = reqPath === '/' ? '/v1' : `/v1${reqPath.startsWith('/') ? '' : '/'}${reqPath}`;
  }
  let query = typeof event.rawQuery === 'string' ? event.rawQuery : '';
  if (!query && event.queryStringParameters) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(event.queryStringParameters)) {
      if (v !== undefined && v !== null) sp.append(k, String(v));
    }
    query = sp.toString();
  }
  return query ? `${reqPath}?${query}` : reqPath;
}

function isBinaryContentType(contentType) {
  if (!contentType) return false;
  const ct = String(contentType).toLowerCase();
  if (
    ct.startsWith('text/') ||
    ct.includes('application/json') ||
    ct.includes('application/javascript') ||
    ct.includes('application/xml') ||
    ct.includes('image/svg+xml')
  ) {
    return false;
  }
  return (
    ct.startsWith('audio/') ||
    ct.startsWith('video/') ||
    ct.startsWith('image/') ||
    ct.startsWith('application/octet-stream') ||
    ct.startsWith('application/pdf')
  );
}

exports.handler = async function handler(event) {
  const port = await getServerPort();
  const targetPath = normalizePath(event);
  const method = event.httpMethod || 'GET';

  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (v === undefined || v === null) continue;
    const lower = k.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'connection') continue;
    headers[lower] = String(v);
  }

  const bodyBuf = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
    : null;
  if (bodyBuf) {
    headers['content-length'] = String(bodyBuf.byteLength);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: targetPath,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const outBuf = Buffer.concat(chunks);
          const outHeaders = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v === undefined) continue;
            if (k.toLowerCase() === 'transfer-encoding' || k.toLowerCase() === 'connection') {
              continue;
            }
            outHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
          }
          const binary = isBinaryContentType(outHeaders['content-type']);
          resolve({
            statusCode: res.statusCode || 200,
            headers: outHeaders,
            body: binary ? outBuf.toString('base64') : outBuf.toString('utf8'),
            isBase64Encoded: binary,
          });
        });
      },
    );
    req.on('error', reject);
    if (bodyBuf && bodyBuf.byteLength > 0) {
      req.write(bodyBuf);
    }
    req.end();
  });
};
