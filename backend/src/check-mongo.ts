import {config} from './config.js';
import {createStore,emptyState} from './data/store.js';
if(config.database!=='mongo')throw new Error('This check requires DATABASE_ADAPTER=mongo.');
let db:Awaited<ReturnType<typeof createStore>>|undefined;
try{db=await createStore(config,async()=>emptyState());await db.transaction(()=>undefined);console.log('MongoDB application indexes and no-op transaction: passed. No demo records inserted.');}catch(error){console.error(`MongoDB application check failed (${error instanceof Error?error.name:'Error'}). Check transaction/index privileges locally.`);process.exitCode=1;}finally{await db?.close();}
