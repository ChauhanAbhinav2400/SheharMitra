import { config } from './config.js';
import { createStore, emptyState } from './data/store.js';
import { randomUUID } from 'node:crypto';

const [userId, role] = process.argv.slice(2);
if (!userId || !['admin','resolver','dispute_resolver'].includes(role)) throw new Error('Usage: tsx src/grant-role.ts <existing-user-id> <admin|dispute_resolver|resolver>. Run only from the trusted backend host.');
const db = await createStore(config, async () => emptyState());
await db.transaction(s => {
  const user = s.users.find(u => u.id === userId);
  if (!user) throw new Error('Existing account not found. Register the account first.');
  user.roles = [role==='resolver'?'dispute_resolver':role];s.sessions=s.sessions.filter(x=>x.userId!==user.id);s.pushDevices=s.pushDevices.filter(x=>x.userId!==user.id);for(const shop of s.shops)if(shop.sellerId===user.id)shop.suspended=true;for(const trip of s.trips)if(trip.partnerId===user.id)trip.available=false;
  s.infraAudit.push({ id: randomUUID(), actorId: 'host-operator', action: `role_granted_${role}`, resourceId: user.id, at: new Date().toISOString() });
});
await db.close(); console.log('Role granted. The account must refresh its session.');
