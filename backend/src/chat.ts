import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Server } from 'socket.io';
import type { Store } from './data/store.js';
import { requireAuth } from './auth.js';
import { ensure } from './errors.js';
import {isStaff} from './roles.js';
import type { ConversationRecord } from './infra-types.js';

// Keep old IDs valid while presenting one thread for each pair of people.
export function conversationGroup(state: {conversations: ConversationRecord[]}, conversation: ConversationRecord) {
  const members = JSON.stringify([...conversation.members].sort());
  return state.conversations.filter(c => c.members.length === 2 && JSON.stringify([...c.members].sort()) === members)
    .sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}
export async function conversationMember(db: Store, id: string, userId: string) {
  return db.read(s => s.conversations.find(c => c.id === id && c.members.includes(userId)));
}
export function createChatRouter(db: Store, getIo: () => Server | undefined) {
  const router = Router();
  const read:Store['read']=fn=>db.read(fn,['users','conversations','messages']);
  const transaction:Store['transaction']=fn=>db.transaction(fn,['users','shops','orders','conversations','messages','uploads','notifications']);
  router.use(requireAuth);
  router.get('/', async (req, res) => {
    const result = await read(s => s.conversations.filter(c => c.members.includes(req.user!.id) && conversationGroup(s,c)[0]?.id === c.id).map(c => {
      const group=conversationGroup(s,c), ids=new Set(group.map(x=>x.id));
      const messages = s.messages.filter(m => ids.has(m.conversationId)).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
      return { ...c, participants: c.members.map(id => { const user = s.users.find(u => u.id === id); return { id, name: user?.name || '' }; }), lastMessage: messages.at(-1), unread: messages.filter(m => m.senderId !== req.user!.id && m.createdAt > (group.find(x=>x.id===m.conversationId)?.readAt?.[req.user!.id] || '')).length };
    }).sort((a,b) => (b.lastMessage?.createdAt || b.createdAt).localeCompare(a.lastMessage?.createdAt || a.createdAt)));
    res.json({ conversations: result });
  });
  router.post('/', async (req, res) => {
    const input = z.object({ shopId: z.string().max(100).optional(), orderId: z.string().max(100).optional(), recipientId: z.string().max(100).optional() }).strict().parse(req.body);
    const conversation = await transaction(s => {
      const userId = req.user!.id;
      let peer: string | undefined;
      if (input.orderId) {
        const order = s.orders.find(o => o.id === input.orderId);
        ensure(order, 404, 'not_found');
        const ids = [order.buyerId, order.sellerId, order.assignment?.partnerId].filter(Boolean) as string[];
        const negotiationPartners = order.offers.map(o => o.partnerId);
        const proposedPair = (userId === order.buyerId && input.recipientId && negotiationPartners.includes(input.recipientId)) || (input.recipientId === order.buyerId && negotiationPartners.includes(userId));
        ensure((ids.includes(userId) && input.recipientId && ids.includes(input.recipientId)) || proposedPair, 403, 'not_allowed');
        peer = input.recipientId;
      } else if (input.shopId) {
        const shop = s.shops.find(shop => shop.id === input.shopId && shop.approved && !shop.suspended);
        ensure(shop, 404, 'not_found'); peer = shop.sellerId;
      }
      ensure(peer && peer !== userId, 400, 'invalid_recipient');
      ensure(s.users.some(u=>u.id===peer&&!u.banned&&!isStaff(u)),403,'recipient_unavailable');
      const existing = s.conversations.find(c => c.members.includes(userId) && c.members.includes(peer!) && c.members.length === 2);
      if (existing) return conversationGroup(s,existing)[0];
      const created: ConversationRecord = { id: randomUUID(), members: [userId, peer], shopId: input.shopId, orderId: input.orderId, createdAt: new Date().toISOString(), readAt: {} };
      s.conversations.push(created); return created;
    });
    res.status(201).json({ conversation });
  });
  router.get('/:id/messages', async (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const before = typeof req.query.before === 'string' ? req.query.before : '';
    const data = await read(s => {
      const conversation = s.conversations.find(c => c.id === req.params.id && c.members.includes(req.user!.id));
      ensure(conversation, 404, 'not_found');
      const group=conversationGroup(s,conversation), ids=new Set(group.map(c=>c.id));
      const messages = s.messages.filter(m => ids.has(m.conversationId) && (!before || m.createdAt < before)).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit).reverse();
      return { conversation:group[0], messages, participants: conversation.members.map(id => ({ id, name: s.users.find(u => u.id === id)?.name || '' })) };
    }); res.json(data);
  });
  router.post('/:id/messages', async (req, res) => {
    const input = z.object({ text: z.string().trim().max(4000).default(''), imageId: z.string().max(100).optional(), clientId: z.string().min(8).max(100) }).strict().refine(v => v.text.length || v.imageId).parse(req.body);
    const { message, members } = await transaction(s => {
      const requested = s.conversations.find(c => c.id === req.params.id && c.members.includes(req.user!.id));
      ensure(requested, 404, 'not_found');
      const group=conversationGroup(s,requested), conversation=group[0], ids=new Set(group.map(c=>c.id));
      ensure(conversation.members.every(id=>s.users.some(u=>u.id===id&&!u.banned&&!isStaff(u))),403,'recipient_unavailable');
      if (input.imageId) ensure(s.uploads.some(u => u.id === input.imageId && u.ownerId === req.user!.id && u.purpose === 'chat' && ids.has(u.conversationId || '')), 400, 'invalid_upload');
      const existing = s.messages.find(m => m.senderId === req.user!.id && m.clientId === input.clientId && ids.has(m.conversationId));
      if (existing) return { message: existing, members: conversation.members };
      const message = { id: randomUUID(), conversationId: conversation.id, senderId: req.user!.id, text: input.text, imageId: input.imageId, createdAt: new Date().toISOString(), clientId: input.clientId };
      s.messages.push(message); for(const c of group)(c.readAt ??= {})[req.user!.id] = message.createdAt;
      return { message, members: conversation.members };
    });
    for (const member of members) getIo()?.to(`user:${member}`).emit('message:new', message);
    res.status(201).json({ message });
  });
  router.post('/:id/read', async (req, res) => {
    await transaction(s => { const c = s.conversations.find(c => c.id === req.params.id && c.members.includes(req.user!.id)); ensure(c, 404, 'not_found'); for(const item of conversationGroup(s,c))(item.readAt ??= {})[req.user!.id] = new Date().toISOString(); });
    res.json({ ok: true });
  });
  return router;
}
