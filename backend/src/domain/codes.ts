import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { CodeRecord } from './types.js';
import { ensure } from './errors.js';

function key(secret: string) { return createHash('sha256').update(secret).digest(); }
export function createCode(secret: string, expiresAt: string, forbidden?: string): CodeRecord {
  let value: string;
  do { value = randomInt(100000, 1000000).toString(); } while (value === forbidden);
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { hash: createHash('sha256').update(`${secret}:${value}`).digest('hex'), ciphertext: [iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('hex')].join('.'), expiresAt, attempts: 0 };
}
export function revealCode(record: CodeRecord, secret: string): string {
  const [iv, tag, encrypted] = record.ciphertext.split('.');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, 'hex')), decipher.final()]).toString('utf8');
}
// The caller must persist failed attempts before returning the domain error.
export function checkCode(record: CodeRecord, value: string, secret: string, now = Date.now()): string | null {
  if (record.consumedAt || Date.parse(record.expiresAt) <= now) return 'code_expired';
  if (record.attempts >= 5) return 'code_locked';
  record.attempts += 1;
  const candidate = createHash('sha256').update(`${secret}:${value}`).digest();
  if (!timingSafeEqual(candidate, Buffer.from(record.hash, 'hex'))) return 'code_incorrect';
  record.consumedAt = new Date(now).toISOString();
  return null;
}
