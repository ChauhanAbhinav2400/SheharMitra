import { config } from './config.js';
import { createStore, emptyState } from './data/store.js';
import { storage } from './uploads.js';
import { randomUUID } from 'node:crypto';

// Run from the trusted backend host. Completed/cancelled orders and ledger events are retained.
const db = await createStore(config, async () => emptyState());
const removePrivate = process.argv.includes('--prune-reviewed-identity');
const now = Date.now();
const keys = await db.transaction(s => {
  s.sessions = s.sessions.filter(x => new Date(x.expiresAt).getTime() > now);
  s.otps = s.otps.filter(x => new Date(x.expiresAt).getTime() > now);
  const referenced = new Set([
    ...s.shops.flatMap(x => [x.image, ...x.gallery].map(url => url.split('/').at(-1))),
    ...s.messages.map(x => x.imageId), ...s.orders.map(x => x.packaging?.imageId),
    ...s.orders.flatMap(x => x.dispute?.evidence || []),
    ...s.verifications.flatMap(x => [x.documentId, x.selfieId]),
  ]);
  const expiredPrivate = new Set(removePrivate ? s.verifications.filter(v => v.status !== 'pending' && v.reviewedAt && now - new Date(v.reviewedAt).getTime() > 30*86400_000).flatMap(v => [v.documentId,v.selfieId]) : []);
  const expired = s.uploads.filter(x => (!referenced.has(x.id) && now - new Date(x.createdAt).getTime() > 86400_000) || expiredPrivate.has(x.id));
  for (const upload of expired) s.infraAudit.push({ id: randomUUID(), actorId: 'host-operator', action: 'upload_retention_delete', resourceId: upload.id, at: new Date().toISOString() });
  s.uploads = s.uploads.filter(x => !expired.some(e => e.id === x.id));
  return expired.map(x => x.key);
});
for (const key of keys) await storage.remove(key);
await db.close();
console.log(`Expired session/OTP records cleaned; ${keys.length} temporary or reviewed identity uploads removed. Order history retained.`);
