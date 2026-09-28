import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

import { initNativeSession } from './lib/session';
import { initBackButton, isNative } from './lib/native';
import { initMonitoring } from './lib/telemetry';

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
const el = root;

initMonitoring();
if (!isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
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
