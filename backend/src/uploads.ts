import { Router, type Request } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import type { Store } from './data/store.js';
import type { UploadRecord } from './infra-types.js';
import type { State } from './domain/types.js';
import {marketplaceOnly,isResolver,isStaff} from './roles.js';
import { requireAuth } from './auth.js';
import { ensure, HttpError } from './errors.js';

export interface StorageAdapter { put(key: string, bytes: Buffer, contentType: string): Promise<void>; read(key: string): Promise<Buffer>; remove(key: string): Promise<void>; privateUrl?(key: string): Promise<string>; }
const s3 = config.storage === 's3' ? new S3Client({ region: config.s3.region, ...(config.s3.endpoint ? { endpoint: config.s3.endpoint, forcePathStyle: true } : {}), ...(config.s3.accessKeyId && config.s3.secretAccessKey ? { credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey } } : {}) }) : undefined;
export const storage: StorageAdapter = s3 ? {
  async put(key, bytes, contentType) { await s3.send(new PutObjectCommand({ Bucket: config.s3.bucket, Key: key, Body: bytes, ContentType: contentType, ServerSideEncryption: 'AES256' })); },
  async read(key) { const result = await s3.send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: key })); ensure(result.Body, 404, 'not_found'); return Buffer.from(await result.Body.transformToByteArray()); },
  async remove(key) { await s3.send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key })); },
  async privateUrl(key) { return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.s3.bucket, Key: key }), { expiresIn: 60 }); }
} : {
  async put(key, bytes) { const path = join(config.uploadDir, ...key.split('/')); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, bytes, { mode: 0o600 }); },
  async read(key) { return readFile(join(config.uploadDir, ...key.split('/'))); },
  async remove(key) { await unlink(join(config.uploadDir, ...key.split('/'))).catch(() => undefined); }
};
const multipart = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 4 }, fileFilter: (_req, file, done) => done(null, ['image/jpeg','image/png','image/webp'].includes(file.mimetype)) });
export async function normalizeImage(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer, { limitInputPixels: 20_000_000, animated: false }).metadata();
    ensure(['jpeg','png','webp'].includes(metadata.format || ''), 400, 'invalid_image');
    return await sharp(buffer, { limitInputPixels: 20_000_000, animated: false }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new HttpError(400, 'invalid_image'); }
}
function canRead(s: State, upload: UploadRecord, userId: string, admin: boolean) {
  const user=s.users.find(u=>u.id===userId);
  if(isStaff(user)&&!['identity','selfie','shop'].includes(upload.purpose)){
    const orderId=upload.orderId||s.conversations.find(c=>c.id===upload.conversationId)?.orderId;
    const order=s.orders.find(o=>o.id===orderId&&o.dispute);
    return !!(order&&!([order.buyerId,order.sellerId,order.assignment?.partnerId].includes(userId))&&(admin||isResolver(user))&&s.infraAudit.some(a=>a.actorId===userId&&a.action==='dispute_case_view'&&a.resourceId===order.id));
  }
  if (upload.ownerId === userId) return true;
  if (['identity','selfie'].includes(upload.purpose)) return admin;
  if (upload.purpose === 'shop') return true;
  if (upload.purpose === 'chat') return !!s.conversations.find(c => c.id === upload.conversationId && c.members.includes(userId));
  if (['packaging','evidence'].includes(upload.purpose)) return !!s.orders.find(o => o.id === upload.orderId && ([o.buyerId, o.sellerId, o.assignment?.partnerId, o.dispute?.resolverId].includes(userId)));
  return false;
}
export const signUpload = (id: string, userId: string, expires: string) => createHmac('sha256', config.sessionSecret).update(`${id}:${userId}:${expires}`).digest('hex');
export function createUploadRouter(db: Store) {
  const router = Router();
  const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'too_many_attempts' } } });
  router.post('/', requireAuth, marketplaceOnly, uploadLimiter, multipart.single('file'), async (req, res) => {
    const input = z.object({ purpose: z.enum(['identity','selfie','chat','shop','packaging','evidence']), conversationId: z.string().max(100).optional(), orderId: z.string().max(100).optional() }).parse(req.body);
    ensure(req.file, 400, 'invalid_image');
    if (input.purpose === 'chat') ensure(await db.read(s => s.conversations.some(c => c.id === input.conversationId && c.members.includes(req.user!.id))), 403, 'not_allowed');
    if (input.purpose === 'packaging') ensure(await db.read(s => s.orders.some(o => o.id === input.orderId && o.sellerId === req.user!.id)), 403, 'not_allowed');
    if (input.purpose === 'evidence') ensure(await db.read(s => s.orders.some(o => o.id === input.orderId && [o.buyerId,o.sellerId,o.assignment?.partnerId].includes(req.user!.id))), 403, 'not_allowed');
    const bytes = await normalizeImage(req.file.buffer);
    const id = randomUUID(), key = `${input.purpose === 'shop' ? 'public' : 'private'}/${id}.webp`;
    await storage.put(key, bytes, 'image/webp');
    const upload: UploadRecord = { id, ownerId: req.user!.id, purpose: input.purpose, key, mime: 'image/webp', bytes: bytes.length, createdAt: new Date().toISOString(), conversationId: input.conversationId, orderId: input.orderId };
    try { await db.transaction(s => { s.uploads.push(upload); }); } catch (error) { await storage.remove(key); throw error; }
    res.status(201).json({ upload: { id, purpose: input.purpose, ...(input.purpose === 'shop' ? { url: `${config.publicOrigin}/api/uploads/public/${id}` } : {}) } });
  });
  router.get('/public/:id', async (req, res) => {
    const upload = await db.read(s => s.uploads.find(u => u.id === req.params.id && u.purpose === 'shop'));
    ensure(upload, 404, 'not_found');
    res.set({ 'Cache-Control': 'public, max-age=86400', 'Content-Type': upload.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" });
    // Serve only purpose=shop images through the stable public URL. Caching a
    // redirect for a day previously left browsers with a 60-second S3 URL.
    res.send(await storage.read(upload.key));
  });
  router.get('/:id/access', requireAuth, async (req, res) => {
    const upload = await db.transaction(s => {
      const found = s.uploads.find(u => u.id === req.params.id); ensure(found && canRead(s, found, req.user!.id, req.user!.roles.includes('admin')), 404, 'not_found');
      s.infraAudit.push({ id: randomUUID(), actorId: req.user!.id, action: 'private_upload_view', resourceId: found.id, at: new Date().toISOString() }); return found;
    });
    res.set('Cache-Control', 'private, no-store');
    if (storage.privateUrl) { res.json({ url: await storage.privateUrl(upload.key), expiresIn: 60 }); return; }
    const expires = String(Date.now() + 60_000);
    res.json({ url: `${config.publicOrigin}/api/uploads/${upload.id}/content?expires=${expires}&signature=${signUpload(upload.id, req.user!.id, expires)}`, expiresIn: 60 });
  });
  router.get('/:id/content', requireAuth, async (req, res) => {
    const expires = String(req.query.expires || ''), signature = String(req.query.signature || '');
    const expected = signUpload(String(req.params.id), req.user!.id, expires);
    ensure(signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) && Number(expires) > Date.now() && Number(expires) < Date.now() + 61_000, 403, 'link_expired');
    const upload = await db.read(s => { const u = s.uploads.find(u => u.id === req.params.id); return u && canRead(s, u, req.user!.id, req.user!.roles.includes('admin')) ? u : undefined; });
    ensure(upload, 404, 'not_found');
    res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': upload.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'" });
    res.send(await readFile(join(config.uploadDir, ...upload.key.split('/'))));
  });
  return router;
}
