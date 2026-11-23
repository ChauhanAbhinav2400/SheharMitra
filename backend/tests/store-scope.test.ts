import {test} from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {MongoStore,emptyState,collections} from '../src/data/store.js';

test('scoped Mongo operations leave unrelated collections untouched and retain notification dependencies',async()=>{
 const state=emptyState();state.users=[{id:'a',roles:['buyer'],banned:false},{id:'b',roles:['buyer'],banned:false}] as any;
 state.shops=[{id:'untouched-shop'}] as any;state.conversations=[{id:'thread',members:['a','b'],createdAt:'2026-01-01',readAt:{}}];
 const reads:string[]=[],writes:string[]=[],store=Object.create(MongoStore.prototype) as any;
 store.models=Object.fromEntries(collections.map(key=>[key,{
  find:()=>{reads.push(key);const query:any={limit:()=>query,lean:()=>query,session:()=>query,then:(resolve:any)=>Promise.resolve(structuredClone(state[key])).then(resolve)};return query;},
  bulkWrite:async(operations:any[])=>{writes.push(key);for(const op of operations){assert.ok(op.replaceOne);const rows=state[key] as any[];const index=rows.findIndex(r=>r.id===op.replaceOne.filter.id);if(index<0)rows.push(op.replaceOne.replacement);else rows[index]=op.replaceOne.replacement;}}
 }]));store.revision={updateOne:async()=>{}};
 const original=mongoose.connection.transaction;mongoose.connection.transaction=(async(fn:any)=>fn({})) as any;
 try{
  await store.read((s:any)=>s.users,['users','sessions']);assert.deepEqual(reads.sort(),['sessions','users']);reads.length=0;
  await store.transaction((s:any)=>s.messages.push({id:'message',conversationId:'thread',senderId:'a',text:'hello',createdAt:'2026-01-02',clientId:'synthetic-client'}),['messages']);
  assert.deepEqual(reads.sort(),['conversations','messages','notifications','users']);assert.deepEqual(writes.sort(),['messages','notifications']);
  assert.equal(state.notifications[0].userId,'b');assert.deepEqual(state.shops,[{id:'untouched-shop'}]);
 }finally{mongoose.connection.transaction=original;}
});
