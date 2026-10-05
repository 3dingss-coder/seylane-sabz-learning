import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell (D20). The web build in `dist/` is bundled into the APK; the app talks to the
 * API at VITE_API_BASE (set at build time) — add `https://localhost` to the API's ALLOWED_ORIGINS.
 * appId must be confirmed before the first Cafe Bazaar upload (it can never change afterwards).
 */
const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID ?? 'ir.seylanesabz.learning',
  appName: 'آکادمی سیلانه',
  webDir: 'dist',
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
