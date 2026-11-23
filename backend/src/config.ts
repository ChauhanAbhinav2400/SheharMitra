import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const production = process.env.NODE_ENV === 'production';
function list(value: string | undefined) { return (value || '').split(',').map(x => x.trim()).filter(Boolean); }
function integer(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}: expected a non-negative integer.`);
  return value;
}
function localSecret() {
  const directory = resolve('./.data');
  const path = resolve(directory, 'session.key');
  mkdirSync(directory, { recursive: true });
  if (!existsSync(path)) writeFileSync(path, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 });
  return readFileSync(path, 'utf8').trim();
}
const sessionSecret = process.env.SESSION_SECRET || (production ? '' : localSecret());
// Browsers send an Origin without a trailing slash, even when a host's
// environment editor contains a copied homepage URL ending in '/'.
const origins = list(process.env.FRONTEND_ORIGINS || 'http://localhost:3000').map(origin => origin.replace(/\/+$/, ''));
const database = process.env.DATABASE_ADAPTER || 'local';
const storage = process.env.STORAGE_ADAPTER || 'local';
const otpProvider = process.env.OTP_PROVIDER || 'demo';
const sameSite = (process.env.COOKIE_SAME_SITE || 'lax') as 'lax' | 'strict' | 'none';
if (!['lax', 'strict', 'none'].includes(sameSite)) throw new Error('COOKIE_SAME_SITE must be lax, strict, or none.');
if (!['local', 'mongo'].includes(database)) throw new Error('DATABASE_ADAPTER must be local or mongo.');
if (!['local', 's3'].includes(storage)) throw new Error('STORAGE_ADAPTER must be local or s3.');
if (!['demo', 'webhook', 'firebase', 'disabled'].includes(otpProvider)) throw new Error('OTP_PROVIDER must be demo, webhook, firebase, or disabled.');
if(otpProvider==='firebase'&&!process.env.FIREBASE_PROJECT_ID)throw new Error('FIREBASE_PROJECT_ID is required for Firebase.');
const turnProvider=process.env.TURN_PROVIDER||'coturn';
if(!['coturn','cloudflare'].includes(turnProvider))throw new Error('TURN_PROVIDER must be coturn or cloudflare.');
if (production) {
  if(process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('Firebase Auth emulator cannot be used in production.');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.');
  if (database !== 'mongo' || !process.env.MONGODB_URI) throw new Error('Production requires DATABASE_ADAPTER=mongo and MONGODB_URI.');
  if (storage !== 's3' || !process.env.S3_BUCKET || !process.env.S3_REGION) throw new Error('Production requires S3 storage with S3_BUCKET and S3_REGION.');
  if (otpProvider === 'demo') throw new Error('Production cannot use the demo OTP provider.');
  if (origins.some(x => !x.startsWith('https://'))) throw new Error('Production FRONTEND_ORIGINS must use HTTPS.');
}
if (database === 'mongo' && !process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for the mongo adapter.');
if (otpProvider === 'webhook' && (!process.env.OTP_WEBHOOK_URL || !process.env.OTP_WEBHOOK_TOKEN)) throw new Error('OTP webhook needs OTP_WEBHOOK_URL and OTP_WEBHOOK_TOKEN.');
export const config = {
  demoSeed:!production&&process.env.DEMO_SEED==='true',
  firebase:{projectId:process.env.FIREBASE_PROJECT_ID||'',clientEmail:process.env.FIREBASE_CLIENT_EMAIL||'',privateKey:process.env.FIREBASE_PRIVATE_KEY||''},
  turnProvider,cloudflareTurnKeyId:process.env.CLOUDFLARE_TURN_KEY_ID||'',cloudflareTurnApiToken:process.env.CLOUDFLARE_TURN_API_TOKEN||'',
  production, port: integer('PORT', 4000), origins, database, storage, otpProvider, sameSite,
  sessionSecret, mongoUri: process.env.MONGODB_URI || '',
  dataFile: resolve(process.env.DATA_FILE || './.data/sheharmitra.json'),
  uploadDir: resolve(process.env.UPLOAD_DIR || './.data/uploads'),
  publicOrigin: process.env.API_ORIGIN || 'http://localhost:4000',
  trustProxy: integer('TRUST_PROXY_HOPS', 0),
  demoPassword: process.env.DEMO_PASSWORD || 'DemoPass123!',
  otpWebhookUrl: process.env.OTP_WEBHOOK_URL || '', otpWebhookToken: process.env.OTP_WEBHOOK_TOKEN || '',
  s3: { region: process.env.S3_REGION || '', bucket: process.env.S3_BUCKET || '', endpoint: process.env.S3_ENDPOINT || '', accessKeyId: process.env.AWS_ACCESS_KEY_ID || '', secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '' },
  stunUrls: list(process.env.STUN_URLS), turnUrls: list(process.env.TURN_URLS), turnSecret: process.env.TURN_SHARED_SECRET || '',
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
};
