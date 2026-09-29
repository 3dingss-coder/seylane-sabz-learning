'use strict';

const { buildCloudflareDeps, createFetchHandler } = require('../../functions/lib/web-handler.js');
const seedSnapshot = require('../../functions/lib/seed-snapshot.json');

let handlerPromise = null;

function getHandler() {
  if (!handlerPromise) {
    handlerPromise = buildCloudflareDeps(process.env, seedSnapshot).then((deps) =>
      createFetchHandler(deps),
    );
  }
  return handlerPromise;
}

function normalizeUrl(event) {
  let reqPath = event.path || '/';
  for (const prefix of ['/.netlify/functions/api', '/api']) {
    if (reqPath === prefix || reqPath.startsWith(`${prefix}/`)) {
      reqPath = reqPath.slice(prefix.length) || '/';
      break;
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
  const host = (event.headers && (event.headers.host || event.headers.Host)) || 'localhost';
  return `https://${host}${reqPath}${query ? `?${query}` : ''}`;
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
    ct.includes('application/pdf')
  );
}

exports.handler = async function handler(event) {
  const fetchHandler = await getHandler();
  const url = normalizeUrl(event);
  const method = event.httpMethod || 'GET';
  const headers = new Headers();
  for (const [k, v] of Object.entries(event.headers || {})) {
    if (v !== undefined && v !== null) headers.set(k, String(v));
  }
  const hasBody = method !== 'GET' && method !== 'HEAD' && event.body;
  const bodyBuf = hasBody
    ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
    : undefined;

  const response = await fetchHandler(
    new Request(url, {
      method,
      headers,
      body: bodyBuf,
    }),
  );

  const outHeaders = {};
  response.headers.forEach((v, k) => {
    outHeaders[k] = v;
  });
  const arrayBuf = await response.arrayBuffer();
  const outBuf = Buffer.from(arrayBuf);
  const binary = isBinaryContentType(outHeaders['content-type']);
  return {
    statusCode: response.status,
    headers: outHeaders,
    body: binary ? outBuf.toString('base64') : outBuf.toString('utf8'),
    isBase64Encoded: binary,
  };
};
