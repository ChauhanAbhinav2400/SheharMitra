import { Router, type Request, type RequestHandler, type Response } from 'express';
import { randomBytes, randomInt, createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { config } from './config.js';
import type { Store } from './data/store.js';
import type { User } from './domain/types.js';
import type { SessionRecord } from './infra-types.js';
import { ensure, HttpError } from './errors.js';
import {verifyFirebasePhone,type VerifiedPhone} from './firebase.js';

declare global { namespace Express { interface Request { user?: User; session?: SessionRecord; } } }
const cookieName = 'sheharmitra_session';
export const hashToken = (value: string) => createHmac('sha256', config.sessionSecret).update(value).digest('hex');
export const publicUser = (user: User) => ({ id: user.id, name: user.name, phone: user.phone, roles: user.roles, partnerStatus: user.partnerStatus, language:user.language||'en' });
const cookieOptions = { httpOnly: true, secure: config.production, sameSite: config.sameSite, path: '/', maxAge: config.sessionTtlMs };
export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'too_many_attempts' } } });
export const otpLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { code: 'too_many_attempts' } } });
export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/);
export const requireAuth: RequestHandler = (req, _res, next) => req.user ? next() : next(new HttpError(401, 'sign_in_required'));
export const requireAdmin: RequestHandler = (req, _res, next) => req.user?.roles.includes('admin') ? next() : next(new HttpError(403, 'not_allowed'));

export function authentication(db: Store): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token = req.cookies?.[cookieName];
      if (typeof token === 'string' && token.length < 200) {
        const found = await db.read(state => {
          const session = state.sessions.find(s => s.tokenHash === hashToken(token) && new Date(s.expiresAt).getTime() > Date.now());
          return { session, user: session ? state.users.find(u => u.id === session.userId) : undefined };
        }, ["sessions", "users"]);
        req.session = found.session; req.user = found.user;
        if(found.user?.banned&&req.path!=='/auth/logout')throw new HttpError(403,'account_banned');
      }
      next();
    } catch (error) { next(error); }
  };
}

export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || !config.origins.includes(origin)) return next(new HttpError(403, 'origin_not_allowed'));
  const token = req.get('x-csrf-token');
  if (!req.session || !token || token.length !== req.session.csrfToken.length || !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrfToken))) return next(new HttpError(403, 'session_expired'));
  next();
};

async function newSession(db: Store, res: Response, userId: string, oldId?: string) {
  const token = randomBytes(32).toString('hex');
  const session: SessionRecord = { id: randomBytes(16).toString('hex'), tokenHash: hashToken(token), userId, csrfToken: randomBytes(32).toString('hex'), expiresAt: new Date(Date.now() + config.sessionTtlMs).toISOString() };
  await db.transaction(state => {
    if(userId)ensure(!state.users.find(u=>u.id===userId)?.banned,403,'account_banned');
    state.sessions = state.sessions.filter(s => s.id !== oldId && new Date(s.expiresAt).getTime() > Date.now());
    state.sessions.push(session);
  });
  res.cookie(cookieName, token, cookieOptions);
  return session;
}

export interface OtpProvider { send(phone: string, code: string): Promise<void>; }
const otpProvider: OtpProvider = {
  async send(phone, code) {
    if (config.otpProvider === 'disabled'||config.otpProvider==='firebase') throw new HttpError(503, 'otp_unavailable');
    if (config.otpProvider === 'demo') return;
    const response = await fetch(config.otpWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.otpWebhookToken}` }, body: JSON.stringify({ phone: `+91${phone}`, code, expiresInSeconds: 300 }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new HttpError(503, 'otp_unavailable');
  }
};

export function createAuthRouter(db: Store, verifyPhone:(token:string)=>Promise<VerifiedPhone>=verifyFirebasePhone) {
  const router = Router();
  router.post('/firebase',authLimiter,async(req,res)=>{
    ensure(config.otpProvider==='firebase',503,'otp_unavailable');
    const input=z.object({idToken:z.string().min(20).max(10000),name:z.string().trim().min(2).max(80).optional(),password:z.string().min(10).max(128).optional()}).strict().parse(req.body);
    const identity=await verifyPhone(input.idToken);
    const existing=await db.read(s=>s.users.find(u=>u.phone===identity.phone));
    if(existing&&!existing.firebaseUid){ensure(input.password&&await bcrypt.compare(input.password,existing.passwordHash),401,'firebase_link_password');}
    const passwordHash=!existing&&input.password?await bcrypt.hash(input.password,12):undefined;
    const user=await db.transaction(s=>{
      ensure(!s.users.some(u=>u.firebaseUid===identity.uid&&u.phone!==identity.phone),409,'firebase_account_conflict');
      let found=s.users.find(u=>u.phone===identity.phone);
      if(found){ensure(!found.banned,403,'account_banned');ensure(!found.firebaseUid||found.firebaseUid===identity.uid,409,'firebase_account_conflict');ensure(found.firebaseUid||existing?.id===found.id,409,'firebase_account_conflict');found.firebaseUid=identity.uid;}
      else{ensure(input.name&&passwordHash,400,'firebase_profile_required');found={id:randomBytes(12).toString('hex'),name:input.name,phone:identity.phone,passwordHash,roles:['buyer'],partnerStatus:'none',createdAt:new Date().toISOString(),firebaseUid:identity.uid};s.users.push(found);}
      return found;
    });
    const session=await newSession(db,res,user.id,req.session?.id);res.json({user:publicUser(user),csrfToken:session.csrfToken});
  });
  router.get(['/csrf', '/me'], async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const session = req.session || await newSession(db, res, '');
    res.json({ user: req.user ? publicUser(req.user) : null, csrfToken: session.csrfToken, demo: !config.production });
  });
  router.post('/login', authLimiter, async (req, res) => {
    const input = z.object({ phone: phoneSchema, password: z.string().min(1).max(128) }).strict().parse(req.body);
    const user = await db.read(s => s.users.find(u => u.phone === input.phone));
    const valid = await bcrypt.compare(input.password, user?.passwordHash || '$2b$12$ylHwCNJdFNG8VmQE6cQbseS8Z59KhyBCqqJ2QpCqaLt2RTu7uNo4S');
    ensure(user && valid, 401, 'invalid_credentials');
    ensure(!user.banned,403,'account_banned');
    const session = await newSession(db, res, user.id, req.session?.id);
    res.json({ user: publicUser(user), csrfToken: session.csrfToken });
  });
  router.post('/otp/request', otpLimiter, async (req, res) => {
    const { phone } = z.object({ phone: phoneSchema }).strict().parse(req.body);
    const code = String(randomInt(100000, 1000000));
    await otpProvider.send(phone, code);
    await db.transaction(s => {
      s.otps = s.otps.filter(o => o.phone !== phone && new Date(o.expiresAt).getTime() > Date.now());
      s.otps.push({ id: randomBytes(12).toString('hex'), phone, codeHash: hashToken(`${phone}:${code}`), expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), attempts: 0 });
    });
    res.json({ sent: true, ...(config.otpProvider === 'demo' && !config.production ? { demoCode: code, demo: true } : {}) });
  });
  router.post('/register', authLimiter, async (req, res) => {
    ensure(config.otpProvider!=='firebase'&&config.otpProvider!=='disabled',503,'otp_unavailable');
    const input = z.object({ name: z.string().trim().min(2).max(80), phone: phoneSchema, password: z.string().min(10).max(128), otp: z.string().regex(/^\d{6}$/) }).strict().parse(req.body);
    const hash = await bcrypt.hash(input.password, 12);
    const result = await db.transaction(s => {
      const otp = s.otps.find(o => o.phone === input.phone && new Date(o.expiresAt).getTime() > Date.now() && !o.verified);
      if (!otp || otp.attempts >= 5) return { error: 'otp_expired' };
      otp.attempts++;
      if (otp.codeHash !== hashToken(`${input.phone}:${input.otp}`)) return { error: 'invalid_otp' };
      if (s.users.some(u => u.phone === input.phone)) return { error: 'account_exists' };
      otp.verified = true;
      const user: User = { id: randomBytes(12).toString('hex'), name: input.name, phone: input.phone, passwordHash: hash, roles: ['buyer'], partnerStatus: 'none',createdAt:new Date().toISOString() };
      s.users.push(user);
      return { user };
    });
    if (!result.user) throw new HttpError(400, result.error!);
    const session = await newSession(db, res, result.user.id, req.session?.id);
    res.status(201).json({ user: publicUser(result.user), csrfToken: session.csrfToken });
  });
  router.post('/logout', async (req, res) => {
    await db.transaction(s => { s.sessions = s.sessions.filter(x => x.id !== req.session?.id);s.pushDevices=s.pushDevices.filter(d=>d.sessionId!==req.session?.id); });
    res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
    res.json({ ok: true });
  });
  return router;
}

export async function authenticateSocket(db: Store, cookie: string | undefined) {
  const token = (cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token) return undefined;
  return db.read(s => {
    const session = s.sessions.find(x => x.tokenHash === hashToken(token) && new Date(x.expiresAt).getTime() > Date.now());
    return session ? { session, user: s.users.find(x => x.id === session.userId&&!x.banned) } : undefined;
  }, ['sessions','users']);
}
