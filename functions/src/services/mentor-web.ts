/**
 * Public-web helpers for the mentor plus-menu (link, pasted text, "search this").
 * Company product claims still win: callers must label these facts as external data.
 */

const BLOCKED_HOST = /^(localhost|metadata\.google\.internal|metadata|metadata\.google)$/i;

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
}

function ipv4FromUint(n: number): string {
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
}

/** Strip brackets, trailing dots, IPv4-mapped IPv6 and decimal IPs before the private-host check. */
export function canonicalHost(host: string): string {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  if (h.startsWith('::ffff:')) {
    const rest = h.slice('::ffff:'.length);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(rest)) return rest;
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
    if (hex?.[1] && hex[2])
      return ipv4FromUint((parseInt(hex[1], 16) << 16) + parseInt(hex[2], 16));
  }
  if (/^\d+$/.test(h)) {
    const n = Number(h);
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) return ipv4FromUint(n);
  }
  return h;
}

function isPrivateIpv4(h: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n > 255)) return true;
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function isPrivateHost(host: string): boolean {
  const h = canonicalHost(host);
  if (!h || h === '::' || h === '::1' || BLOCKED_HOST.test(h)) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return isPrivateIpv4(h);
}

/** http(s) only, no credentials, no private or link-local hosts. */
export function isPublicHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (isPrivateHost(u.hostname)) return null;
  return u;
}

export function extractUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const u = isPublicHttpUrl(raw.replace(/[.,;:!?؟]+$/, ''));
    if (u && !out.includes(u.toString())) out.push(u.toString());
    if (out.length >= 2) break;
  }
  return out;
}

const EXPLICIT_WEB = /(جستجو کن|سرچ کن|در اینترنت|تو اینترنت|از اینترنت|گوگل کن|وب را بگرد)/;

export function wantsWebSearch(question: string, hasLink: boolean): boolean {
  if (hasLink) return true;
  if (extractUrls(question).length > 0) return true;
  return EXPLICIT_WEB.test(question);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => {
      const c = Number(n);
      return c > 0 && c < 0x10ffff ? String.fromCodePoint(c) : '';
    });
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8_000);
  return { title, text };
}

async function fetchChecked(url: URL, timeoutMs: number, hops = 0): Promise<Response | null> {
  if (hops > 3 || isPrivateHost(url.hostname)) return null;
  const res = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'user-agent': 'SeylaneSabzMentor/1.0',
      accept: 'text/html,application/json;q=0.9,*/*;q=0.5',
    },
  });
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (!loc) return null;
    const next = isPublicHttpUrl(new URL(loc, url).toString());
    if (!next) return null;
    return fetchChecked(next, timeoutMs, hops + 1);
  }
  return res;
}

async function readCapped(res: Response, max: number): Promise<string | null> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > max) return null;
  if (!res.body) {
    const text = await res.text();
    return text.length > max ? null : text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/** Fetches a public page and returns plain text. Fails closed (null) on any error or private host. */
export async function fetchPublicPage(
  raw: string,
  timeoutMs = 6_000,
): Promise<{ title: string; text: string; url: string } | null> {
  const url = isPublicHttpUrl(raw);
  if (!url) return null;
  try {
    const res = await fetchChecked(url, timeoutMs);
    if (!res || !res.ok) return null;
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype && !/text\/|json|xml|javascript/.test(ctype)) return null;
    const rawText = await readCapped(res, 500_000);
    if (!rawText) return null;
    const parsed = /json/.test(ctype)
      ? { title: url.hostname, text: rawText.slice(0, 8_000) }
      : htmlToText(rawText);
    if (parsed.text.length < 40) return null;
    return { ...parsed, url: url.toString() };
  } catch {
    return null;
  }
}

/** Best-effort public search. Empty on failure — never throws into the answer path. */
export async function searchWeb(query: string, timeoutMs = 6_000): Promise<WebHit[]> {
  const q = query.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (q.length < 2) return [];
  const hits: WebHit[] = [];
  try {
    const wiki = new URL('https://fa.wikipedia.org/w/api.php');
    wiki.searchParams.set('action', 'opensearch');
    wiki.searchParams.set('search', q);
    wiki.searchParams.set('limit', '3');
    wiki.searchParams.set('namespace', '0');
    wiki.searchParams.set('format', 'json');
    const res = await fetchChecked(wiki, timeoutMs);
    if (res?.ok) {
      const raw = await readCapped(res, 200_000);
      const data = raw ? (JSON.parse(raw) as unknown) : null;
      if (
        Array.isArray(data) &&
        Array.isArray(data[1]) &&
        Array.isArray(data[2]) &&
        Array.isArray(data[3])
      ) {
        const titles = data[1] as string[];
        const snippets = data[2] as string[];
        const urls = data[3] as string[];
        for (let i = 0; i < titles.length && hits.length < 3; i++) {
          const snippet = (snippets[i] ?? '').trim();
          if (!snippet) continue;
          hits.push({ title: titles[i] ?? q, url: urls[i] ?? '', snippet: snippet.slice(0, 500) });
        }
      }
    }
  } catch {
    /* search is optional */
  }
  if (hits.length >= 2) return hits;
  try {
    const ddg = new URL('https://api.duckduckgo.com/');
    ddg.searchParams.set('q', q);
    ddg.searchParams.set('format', 'json');
    ddg.searchParams.set('no_html', '1');
    ddg.searchParams.set('skip_disambig', '1');
    const res = await fetchChecked(ddg, timeoutMs);
    if (!res?.ok) return hits;
    const data = (await res.json()) as {
      Heading?: string;
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };
    if (data.AbstractText) {
      hits.push({
        title: data.Heading || q,
        url: data.AbstractURL || '',
        snippet: data.AbstractText.slice(0, 500),
      });
    }
    for (const t of data.RelatedTopics ?? []) {
      if (!t.Text) continue;
      hits.push({
        title: t.Text.slice(0, 80),
        url: t.FirstURL || '',
        snippet: t.Text.slice(0, 500),
      });
      if (hits.length >= 4) break;
    }
  } catch {
    /* ignore */
  }
  return hits.slice(0, 4);
}
