import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

import { initNativeSession } from './lib/session';
import { initBackButton, isNative } from './lib/native';
import { initMonitoring } from './lib/telemetry';
import { armMotionOnInteraction } from './lib/motion';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
const el = root;

initMonitoring();
armMotionOnInteraction();
if (!isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) =>
    registerSW({
      immediate: true,
      // Tabs that stay open for days only re-check sw.js on navigation; poll hourly so every
      // client picks up a new deploy (autoUpdate then activates it and reloads the page).
      onRegisteredSW(_url, registration) {
        if (!registration) return;
        const check = () => void registration.update().catch(() => undefined);
        setInterval(check, 3_600_000);
        // An installed PWA is resumed, not reopened: check as soon as the user comes back to it.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      },
    }),
  );
}
// A deploy removes old hashed chunks; a page still running the old index.html then fails to load a
// lazy chunk. Reload once (guarded, so a real outage can't cause a reload loop) to fetch the new build.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem('chunk-reload') === '1') return;
    sessionStorage.setItem('chunk-reload', '1');
  } catch {
    return;
  }
  window.location.reload();
});
void initNativeSession()
  .catch(() => undefined)
  .then(() => {
    void initBackButton();
    createRoot(el).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
