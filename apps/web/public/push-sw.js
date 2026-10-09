/* Web Push handler, imported into the Workbox service worker (vite.config.ts → importScripts).
 * Data-only FCM payloads are displayed here so FCM and the worker cannot show duplicates. */
self.addEventListener('push', (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch (_) {
    p = { notification: { body: event.data ? event.data.text() : '' } };
  }
  const n = p.notification || {};
  const data = p.data || {};
  const link = (p.fcmOptions && p.fcmOptions.link) || data.link || '/notifications';
  event.waitUntil(
    self.registration.showNotification(n.title || data.title || 'آکادمی سیلانه', {
      body: n.body || data.body || '',
      ...(n.image || data.imageUrl ? { image: n.image || data.imageUrl } : {}),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'fa',
      tag: data.notificationId || undefined,
      data: { link },
    }),
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
