import {createStaffAdminRouter,createResolverRouter} from './staff.js';
import {marketplaceOnly} from './roles.js';
import {createNotificationRouter} from './notifications.js';
import {orderMessage,orderRole} from './domain/status-messages.js';
import {createLocationRouter} from './location.js';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import type { Server } from 'socket.io';
import type { Store } from './data/store.js';
import { config } from './config.js';
import { authentication, createAuthRouter, csrfProtection, requireAuth } from './auth.js';
import { createChatRouter } from './chat.js';
import { createCallsRouter } from './realtime.js';
import { createUploadRouter } from './uploads.js';
import { createAdminRouter, createVerificationRouter } from './verification.js';
import { createCommerceRouter } from './commerce-router.js';
import { HttpError } from './errors.js';

export function createApp(db: Store, getIo: () => Server | undefined = () => undefined) {
  const app = express();
  app.disable('x-powered-by'); app.set('trust proxy', config.trustProxy);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin(origin, callback) { callback(null, !origin || config.origins.includes(origin)); }, credentials: true, methods: ['GET','POST','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','X-CSRF-Token','Idempotency-Key'] }));
  app.use(express.json({ limit: '80kb' })); app.use(cookieParser());
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'sheharmitra-api' }));
  app.get('/ready', (_req, res) => res.status(db.ready() ? 200 : 503).json({ ready: db.ready() }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'too_many_attempts' } } }));
  app.use('/api', (_req, res, next) => { res.set({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }); next(); });
  app.use('/api', authentication(db), csrfProtection);
  app.use('/api/auth', createAuthRouter(db));
  app.use('/api/notifications',createNotificationRouter(db));
  app.use('/api',(req,res,next)=>/^\/(admin|resolver|uploads)(\/|$)/.test(req.path)?next():marketplaceOnly(req,res,next));
  app.use('/api/locations',createLocationRouter(db));
  app.use('/api/conversations', createChatRouter(db, getIo));
  app.use('/api/calls', createCallsRouter());
  app.use('/api/uploads', createUploadRouter(db));
  app.use('/api/verification', createVerificationRouter(db));
  app.use('/api/admin/disputes',createResolverRouter(db,true));
  app.use('/api/resolver',createResolverRouter(db));
  app.use('/api/admin',createStaffAdminRouter(db,getIo),createAdminRouter(db));
  app.use('/api/orders/:id', (req, res, next) => {
    const orderId = String(req.params.id);
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) res.on('finish', () => {
      if (res.statusCode >= 400) return;
      void db.read(s => ({order:s.orders.find(o => o.id === orderId),languages:Object.fromEntries(s.users.map(u=>[u.id,u.language||'en']))})).then(({order,languages}) => {
        if (!order) return;
        for (const id of new Set([order.buyerId, order.sellerId, order.assignment?.partnerId, order.dispute?.resolverId].filter(Boolean))) getIo()?.to(`user:${id}`).emit('order:updated', { orderId: order.id, status: order.status, message:orderMessage(order.status,orderRole(order,id as string),languages[id as string]) });
      }).catch(() => undefined);
    });
    next();
  });
  app.use('/api', createCommerceRouter(db, requireAuth));
  app.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) { res.status(400).json({ error: { code: 'invalid_input', fields: error.issues.map(i => i.path.join('.')) } }); return; }
    const multipartError = typeof error.code === 'string' && error.code.startsWith('LIMIT_');
    const status = typeof error.status === 'number' && error.status >= 400 && error.status < 600 ? error.status : error.code === 'LIMIT_FILE_SIZE' ? 413 : multipartError ? 400 : 500;
    const code = status === 500 ? 'something_wrong' : error.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : multipartError ? 'invalid_upload' : error.code || 'invalid_request';
    if (status === 500) console.error('Request failed:', error.name || 'Error');
    res.status(status).json({ error: { code } });
  };
  app.use(errorHandler); return app;
}
