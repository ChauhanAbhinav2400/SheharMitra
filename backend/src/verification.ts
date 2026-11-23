import {isStaff,isResolver} from './roles.js';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './data/store.js';
import { requireAuth, requireAdmin } from './auth.js';
import { ensure } from './errors.js';
import type { VerificationRecord } from './infra-types.js';

export function createVerificationRouter(db: Store) {
  const router = Router(); router.use(requireAuth);
  router.get('/', async (req, res) => res.json({ verification: await db.read(s => s.verifications.find(v => v.userId === req.user!.id)) || null }));
  router.post('/', async (req, res) => {
    const input = z.object({ documentType: z.enum(['voter_id','driving_license','passport','other_government_id']), documentId: z.string(), selfieId: z.string(), transportMode: z.enum(['bicycle','motorcycle','car','van']), licenseLast4: z.string().regex(/^[A-Za-z0-9]{4}$/).optional(), vehicleLast4: z.string().regex(/^[A-Za-z0-9]{4}$/).optional() }).strict().refine(v => v.transportMode === 'bicycle' || (v.licenseLast4 && v.vehicleLast4), { message: 'vehicle_details_required' }).parse(req.body);
    const verification = await db.transaction(s => {
      ensure(!s.verifications.some(v => v.userId === req.user!.id && ['pending','approved'].includes(v.status)), 409, 'verification_already_submitted');
      ensure(s.uploads.some(u => u.id === input.documentId && u.ownerId === req.user!.id && u.purpose === 'identity') && s.uploads.some(u => u.id === input.selfieId && u.ownerId === req.user!.id && u.purpose === 'selfie'), 400, 'invalid_upload');
      s.verifications = s.verifications.filter(v => v.userId !== req.user!.id);
      const record: VerificationRecord = { ...input, id: randomUUID(), userId: req.user!.id, status: 'pending', createdAt: new Date().toISOString() };
      s.verifications.push(record); const user = s.users.find(u => u.id === req.user!.id)!; user.partnerStatus = 'pending'; return record;
    }); res.status(201).json({ verification });
  }); return router;
}
export function createAdminRouter(db: Store) {
  const router = Router(); router.use(requireAuth, requireAdmin);
  router.get('/resolvers', async (_req,res)=>res.json({resolvers:await db.read(s=>s.users.filter(u=>isResolver(u)).map(u=>({id:u.id,name:u.name})))}));
  router.get('/reviews', async (_req, res) => res.json(await db.read(s => ({ verifications: s.verifications.map(v => ({ ...v, name: s.users.find(u => u.id === v.userId)?.name })), shops: s.shops.filter(s => !s.approved) }))));
  router.post('/reviews/:id', async (req, res) => {
    const input = z.object({ decision: z.enum(['approved','rejected']), reason: z.string().trim().min(5).max(1000) }).strict().parse(req.body);
    const verification = await db.transaction(s => {
      const v = s.verifications.find(v => v.id === req.params.id); ensure(v, 404, 'not_found'); ensure(v.userId !== req.user!.id, 403, 'self_review_forbidden');
      v.status = input.decision; v.reason = input.reason; v.reviewedBy = req.user!.id; v.reviewedAt = new Date().toISOString();
      const user = s.users.find(u => u.id === v.userId)!;ensure(!isStaff(user)&&!user.banned,409,'staff_marketplace_forbidden'); user.partnerStatus = v.status;
      if (v.status === 'approved') user.roles = [...new Set([...user.roles, 'delivery_partner'])]; else user.roles = user.roles.filter(r => r !== 'delivery_partner');
      s.infraAudit.push({ id: randomUUID(), actorId: req.user!.id, action: `verification_${v.status}`, resourceId: v.id, reason:input.reason, at: v.reviewedAt }); return v;
    }); res.json({ verification });
  });
  router.post('/shops/:id/review', async (req, res) => {
    const input = z.object({ decision: z.enum(['approved','rejected']), reason: z.string().trim().min(5).max(1000) }).strict().parse(req.body);
    const shop = await db.transaction(s => {
      const shop = s.shops.find(x => x.id === req.params.id); ensure(shop, 404, 'not_found'); ensure(shop.sellerId !== req.user!.id, 403, 'self_review_forbidden');
      shop.approved = input.decision === 'approved'; shop.updatedAt = new Date().toISOString();
      const user = s.users.find(u => u.id === shop.sellerId)!;ensure(!isStaff(user)&&!user.banned,409,'staff_marketplace_forbidden');shop.reviewReason=input.reason;
      if (shop.approved) user.roles = [...new Set([...user.roles, 'seller'])];
      s.audit.push({ id: randomUUID(), actorId: req.user!.id, action: `shop_${input.decision}`, resourceId: shop.id, reason: input.reason, at: shop.updatedAt }); return shop;
    }); res.json({ shop });
  }); return router;
}
