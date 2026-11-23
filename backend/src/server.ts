import {retryFirebaseRevocations} from './staff.js';
import {startNotifications} from './notifications.js';
import { createServer } from 'node:http';
import { config } from './config.js';
import { createStore, emptyState } from './data/store.js';
import { createDemoState } from './demo-fixtures.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import type { Server } from 'socket.io';
import { expireReservations } from './domain/service.js';

async function main() {
  const db = await createStore(config, () => config.demoSeed && config.database==='local' ? createDemoState() : Promise.resolve(emptyState()));
  let io: Server | undefined;
  const app = createApp(db, () => io), server = createServer(app);
  io = attachRealtime(server, db);
  const stopNotifications=startNotifications(db,io);
  const expiryTimer = setInterval(() => { void retryFirebaseRevocations(db).catch(()=>{}); void db.transaction(s => expireReservations(s)).catch(() => console.error('Reservation expiry failed.')); }, 30_000);
  expiryTimer.unref();
  server.listen(config.port, () => console.log(`SheharMitra API: ${config.publicOrigin} (${config.database}; DEMO payments only)`));
  let closing = false;
  const shutdown = () => {
    if (closing) return; closing = true;
    clearInterval(expiryTimer);stopNotifications();
    const timer = setTimeout(() => process.exit(1), 10_000); timer.unref();
    io?.close(); server.close(() => { void db.close().then(() => { clearTimeout(timer); process.exit(0); }); });
  };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
main().catch(error => { console.error(`Startup failed: ${error instanceof Error ? error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted connection]') : 'configuration or database error'}`); process.exitCode = 1; });
