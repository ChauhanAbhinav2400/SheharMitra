import sharp from 'sharp';
import { seedState } from './data/seed.js';
import { storage } from './uploads.js';
import { config } from './config.js';

export async function createDemoState() {
  if (config.production) throw new Error('Synthetic fixtures are disabled in production.');
  const state = await seedState(config.demoPassword), now = new Date().toISOString();
  for (const userId of ['partner','partner2','unapproved']) {
    for (const purpose of ['identity','selfie'] as const) {
      const id = `demo-${purpose}-${userId}`, key = `private/${id}.webp`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520"><rect width="800" height="520" rx="24" fill="#FFF8EC"/><rect x="24" y="24" width="752" height="472" rx="16" fill="white" stroke="#1F6B4F" stroke-width="4"/><text x="400" y="85" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="bold" fill="#1F6B4F">SYNTHETIC DEMO ${purpose === 'identity' ? 'DOCUMENT' : 'SELFIE'}</text><circle cx="400" cy="235" r="65" fill="#E3F1EA"/><circle cx="400" cy="220" r="27" fill="#1F6B4F"/><path d="M350 285 Q400 245 450 285" stroke="#1F6B4F" stroke-width="25" fill="none"/><text x="400" y="360" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#2B2118">Fictional delivery partner</text><text x="400" y="410" text-anchor="middle" font-family="sans-serif" font-size="26" font-weight="bold" fill="#B3261E">NOT A VALID ID / NO REAL PERSON</text><text x="400" y="455" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#6B5E50">For local manual-review workflow demonstration only</text></svg>`;
      const image = await sharp(Buffer.from(svg)).webp({ quality:85 }).toBuffer();
      await storage.put(key,image,'image/webp');
      state.uploads.push({ id,ownerId:userId,purpose,key,mime:'image/webp',bytes:image.length,createdAt:now });
    }
    state.verifications.push({ id:`verification-${userId}`, userId, documentType:'other_government_id', documentId:`demo-identity-${userId}`, selfieId:`demo-selfie-${userId}`, transportMode:'motorcycle', licenseLast4:'0000', vehicleLast4:'0000', status:userId === 'unapproved' ? 'pending' : 'approved', createdAt:now, ...(userId === 'unapproved' ? {} : { reason:'Synthetic demo approval only. No real identity or government verification.',reviewedBy:'admin',reviewedAt:now }) });
  }
  return state;
}
