/* Web Push handler, imported into the Workbox service worker (vite.config.ts → importScripts).
 * Supports two payload shapes:
 *  - data-only (current): FCM data = { title, body, image?, link, notificationId, campaignId?, type }
 *  - legacy: { notification: { title, body, image }, data: {...}, fcmOptions: { link } } */
const DEFAULT_TITLE = 'آکادمی سیلانه';

function httpsUrl(v) {
  try {
    const u = new URL(String(v));
    return u.protocol === 'https:' ? u.href : undefined;
  } catch (_) {
    return undefined;
  }
}

self.addEventListener('push', (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch (_) {
    p = { data: { body: event.data ? event.data.text() : '' } };
  }
  const n = p.notification || {};
  const data = p.data || {};
  const title = data.title || n.title || DEFAULT_TITLE;
  const body = data.body || n.body || '';
  const image = httpsUrl(data.image || n.image || data.imageUrl);
  const link = (p.fcmOptions && p.fcmOptions.link) || data.link || '/notifications';
  const tag = data.notificationId || data.campaignId || undefined;
  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'fa',
    timestamp: Date.now(),
    vibrate: [120, 60, 120],
    actions: [{ action: 'open', title: 'مشاهده' }],
    data: { link },
    ...(image ? { image } : {}),
    ...(tag ? { tag, renotify: true } : {}),
  };
  event.waitUntil(
    self.registration.showNotification(title, options).catch(() =>
      // Some platforms reject `actions`/`image`; fall back to the plain notification.
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        dir: 'rtl',
        lang: 'fa',
        data: { link },
        ...(tag ? { tag } : {}),
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.link) || '/';
  const target = new URL(raw, self.location.origin);
  // Only navigate inside our own origin.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          return w.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : undefined));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
