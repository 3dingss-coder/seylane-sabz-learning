/* Local dev server without the Functions emulator (no Java required). */
import { createApp } from './app';

const port = Number(process.env.PORT ?? 5001);
createApp().listen(port, '0.0.0.0', () => {
  console.info(`API listening on http://0.0.0.0:${port}/v1/health`);
});
