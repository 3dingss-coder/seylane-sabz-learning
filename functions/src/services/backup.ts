/**
 * Daily Firestore export → Storage (spec §24 Backup, RPO ~24h).
 * Requires: BACKUP_BUCKET env (gs://…) and the Functions service account to have
 * "Cloud Datastore Import Export Admin" + write access to the bucket (docs/USER-TODO.md).
 */
export async function exportFirestore(): Promise<{ ok: boolean; name?: string; skipped?: string }> {
  const bucket = process.env.BACKUP_BUCKET;
  const projectId = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  if (!bucket || !projectId)
    return { ok: false, skipped: 'BACKUP_BUCKET or project id not configured' };
  const { v1 } = await import('@google-cloud/firestore');
  const client = new v1.FirestoreAdminClient();
  const date = new Date().toISOString().slice(0, 10);
  const [op] = await client.exportDocuments({
    name: client.databasePath(projectId, '(default)'),
    outputUriPrefix: `${bucket.replace(/\/$/, '')}/firestore/${date}`,
    collectionIds: [],
  });
  return { ok: true, name: op.name ?? undefined };
}
