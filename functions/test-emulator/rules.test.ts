import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { Firestore as ModularFirestore } from 'firebase/firestore';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { ref, getBytes, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

/** Firestore + Storage Security Rules (PROMPT 003, spec §24). Runs only on the emulator. */
let env: RulesTestEnvironment;
const root = path.resolve(__dirname, '..', '..');

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT ?? 'demo-seylane',
    firestore: { rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') },
    storage: { rules: fs.readFileSync(path.join(root, 'storage.rules'), 'utf8') },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    // rules-unit-testing currently exposes a compat Firestore type, while this suite deliberately
    // uses the modular firebase/firestore API. The emulator context supplies the same test DB;
    // narrow the type at this boundary without changing runtime behavior.
    const db = c.firestore() as unknown as ModularFirestore;
    const u = (id: string, role: string, teamId: string | null, status = 'active') =>
      setDoc(doc(db, `users/${id}`), { name: id, role, teamId, status });
    await u('mA', 'manager', 'tA');
    await u('mB', 'manager', 'tB');
    await u('a1', 'marketer', 'tA');
    await u('b1', 'marketer', 'tB');
    await u('adm', 'admin', null);
    await u('off', 'marketer', 'tA', 'inactive');
    await setDoc(doc(db, 'brands/b'), { name: 'برند' });
    await setDoc(doc(db, 'packages/pub'), { status: 'published', title: 'x' });
    await setDoc(doc(db, 'packages/draft'), { status: 'draft', title: 'y' });
    await setDoc(doc(db, 'quizzes/q/questions/1'), { answerKey: 'b' });
    await setDoc(doc(db, 'section_progress/a1_s'), { userId: 'a1', percent: 10 });
    await setDoc(doc(db, 'section_progress/b1_s'), { userId: 'b1', percent: 10 });
    await setDoc(doc(db, 'attempts/at1'), { userId: 'a1', snapshot: [] });
    await setDoc(doc(db, 'audit_logs/l1'), { action: 'x' });
    await setDoc(doc(db, 'notifications/n1'), { userId: 'a1' });
    await setDoc(doc(db, 'chat_messages/c1'), { userId: 'a1', text: 'سلام' });
    const st = c.storage();
    await uploadBytes(ref(st, 'brands/b/logo.png'), new Uint8Array([1, 2, 3]));
    await uploadBytes(ref(st, 'media/video/secret.mp4'), new Uint8Array([1, 2, 3]));
  });
});
afterAll(async () => env?.cleanup());

const as = (uid: string | null) =>
  (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore()) as unknown as ModularFirestore;

describe('firestore rules', () => {
  it('deny-by-default: unauthenticated reads fail', async () => {
    await assertFails(getDoc(doc(as(null), 'brands/b')));
    await assertFails(getDoc(doc(as(null), 'users/a1')));
  });
  it('no client writes anywhere (progress/points tampering blocked)', async () => {
    await assertFails(
      setDoc(doc(as('a1'), 'section_progress/a1_s'), { userId: 'a1', percent: 100 }),
    );
    await assertFails(updateDoc(doc(as('a1'), 'users/a1'), { role: 'admin' }));
    await assertFails(setDoc(doc(as('adm'), 'brands/new'), { name: 'x' }));
    await assertFails(setDoc(doc(as('a1'), 'points_ledger/x'), { userId: 'a1', amount: 1000 }));
  });
  it('answer keys, attempts, audit logs and transcripts are never client-readable', async () => {
    await assertFails(getDoc(doc(as('a1'), 'quizzes/q/questions/1')));
    await assertFails(getDoc(doc(as('adm'), 'quizzes/q/questions/1')));
    await assertFails(getDoc(doc(as('a1'), 'attempts/at1')));
    await assertFails(getDoc(doc(as('adm'), 'audit_logs/l1')));
    await assertFails(getDoc(doc(as('a1'), 'chat_messages/c1')));
  });
  it('self / team scope (28.2 #5)', async () => {
    await assertSucceeds(getDoc(doc(as('a1'), 'users/a1')));
    await assertFails(getDoc(doc(as('a1'), 'users/b1')));
    await assertSucceeds(getDoc(doc(as('mA'), 'users/a1')));
    await assertFails(getDoc(doc(as('mA'), 'users/b1')));
    await assertSucceeds(getDoc(doc(as('mA'), 'section_progress/a1_s')));
    await assertFails(getDoc(doc(as('mA'), 'section_progress/b1_s')));
    await assertSucceeds(
      getDocs(query(collection(as('a1'), 'notifications'), where('userId', '==', 'a1'))),
    );
    await assertFails(getDocs(collection(as('a1'), 'notifications')));
  });
  it('drafts are admin-only; inactive users read nothing', async () => {
    await assertSucceeds(getDoc(doc(as('a1'), 'packages/pub')));
    await assertFails(getDoc(doc(as('a1'), 'packages/draft')));
    await assertSucceeds(getDoc(doc(as('adm'), 'packages/draft')));
    await assertFails(getDoc(doc(as('off'), 'brands/b')));
  });
});

describe('storage rules', () => {
  it('catalog images are public; training media and all writes are private', async () => {
    const anon = env.unauthenticatedContext().storage();
    const user = env.authenticatedContext('a1').storage();
    await assertSucceeds(getBytes(ref(anon, 'brands/b/logo.png')));
    await assertFails(getBytes(ref(user, 'media/video/secret.mp4')));
    await assertFails(uploadBytes(ref(user, 'brands/b/logo.png'), new Uint8Array([9])));
    await assertFails(uploadBytes(ref(user, 'media/video/x.mp4'), new Uint8Array([9])));
  });
});
