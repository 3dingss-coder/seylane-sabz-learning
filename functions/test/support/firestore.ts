import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreStore } from '../../src/store/firestore';

/** Firestore emulator store; each call wipes the emulator database first. */
export async function getFirestoreForTests(): Promise<FirestoreStore> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.GCLOUD_PROJECT ?? 'demo-seylane';
  if (!host) throw new Error('FIRESTORE_EMULATOR_HOST is required for TEST_BACKEND=firestore');
  if (!getApps().length) initializeApp({ projectId: project });
  await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`, {
    method: 'DELETE',
  });
  const db = getFirestore();
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* settings already applied */
  }
  return new FirestoreStore(db);
}
