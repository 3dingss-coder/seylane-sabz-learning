import path from 'node:path';
import type { AppConfig } from './config';
import { MemoryAuthProvider } from './auth/memory';
import { LocalBlobStore } from './blob/local';
import { GeminiClient } from './llm/gemini';
import type { LlmClient } from './llm/types';
import { RecordingPushSender } from './push/types';
import type { Deps } from './services/context';
import { MemoryStore } from './store/memory';
import { systemClock, type Clock } from './lib/time';

function llmFrom(config: AppConfig): LlmClient | null {
  return config.geminiApiKey ? new GeminiClient(config.geminiApiKey, config.geminiModel) : null;
}

/** In-memory backend (tests + local server without emulator/Java — D37). */
export function buildMemoryDeps(
  config: AppConfig,
  opts: { persist?: boolean; blobRoot?: string; clock?: Clock; llm?: LlmClient | null } = {},
): Deps & { store: MemoryStore; blob: LocalBlobStore; push: RecordingPushSender } {
  const store = new MemoryStore(opts.persist ? path.join(config.dataDir, 'db.json') : undefined);
  const clock = opts.clock ?? systemClock;
  const blobRoot = opts.blobRoot ?? path.join(config.dataDir, 'blobs');
  return {
    config,
    store,
    auth: new MemoryAuthProvider(store, config.localSecret, () => clock().getTime()),
    blob: new LocalBlobStore(blobRoot, config.localSecret, () => clock().getTime()),
    push: new RecordingPushSender(),
    llm: opts.llm !== undefined ? opts.llm : llmFrom(config),
    clock,
  };
}

/** Firebase backend (Functions runtime or emulator). Lazily imports firebase-admin. */
export async function buildFirebaseDeps(config: AppConfig): Promise<Deps> {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getAuth } = await import('firebase-admin/auth');
  const { getStorage } = await import('firebase-admin/storage');
  const { getMessaging } = await import('firebase-admin/messaging');
  const { FirestoreStore } = await import('./store/firestore');
  const { FirebaseAuthProvider } = await import('./auth/firebase');
  const { FirebaseBlobStore } = await import('./blob/firebase');
  const { FcmPushSender } = await import('./push/fcm');
  if (!getApps().length)
    initializeApp(config.storageBucket ? { storageBucket: config.storageBucket } : undefined);
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return {
    config,
    store: new FirestoreStore(db),
    auth: new FirebaseAuthProvider(getAuth(), config.firebaseWebApiKey),
    blob: new FirebaseBlobStore(getStorage().bucket()),
    push: new FcmPushSender(getMessaging()),
    llm: llmFrom(config),
    clock: systemClock,
  };
}
