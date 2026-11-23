import { config } from './config.js';
import { createStore } from './data/store.js';
import { createDemoState } from './demo-fixtures.js';

if (config.production) throw new Error('Demo seeding is disabled in production.');
if(config.database==='mongo'&&!config.demoSeed)throw new Error('Mongo demo reset blocked. Only set DEMO_SEED=true for a disposable demo database, never live data.');
const seeded = await createDemoState();
const db = await createStore(config, async () => seeded);
await db.transaction(async s => Object.assign(s, seeded));
await db.close();
console.log('SheharMitra synthetic demo reset. See README for local demo accounts.');
