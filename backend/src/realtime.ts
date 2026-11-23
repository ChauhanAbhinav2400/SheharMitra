import {Server} from 'socket.io';
import type {Server as HttpServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {Router} from 'express';
import {z} from 'zod';
import {config} from './config.js';
import {authenticateSocket,requireAuth} from './auth.js';
import type {Store} from './data/store.js';
import type {CallRecord} from './infra-types.js';
import {callsAvailable,iceCredentials} from './turn.js';
import {rateLimit} from 'express-rate-limit';
import {isStaff,marketplaceOnly} from './roles.js';
import {conversationGroup} from './chat.js';
import {activeChats,enqueueNotification} from './notification-events.js';
export {callsAvailable} from './turn.js';
export function createCallsRouter(){const router=Router();router.get('/ice',requireAuth,marketplaceOnly,rateLimit({windowMs:60000,limit:10}),async(req,res)=>{res.set('Cache-Control','private, no-store');res.json(await iceCredentials(req.user!.id));});return router;}
export function attachRealtime(server:HttpServer,db:Store){
 const io=new Server(server,{cors:{origin:config.origins,credentials:true,methods:['GET','POST']},maxHttpBufferSize:50000,allowRequest:(req,done)=>done(null,!!req.headers.origin&&config.origins.includes(req.headers.origin)),pingTimeout:20000});
 const read:Store['read']=fn=>db.read(fn,['calls','users','conversations','pushDevices']);
 const transaction:Store['transaction']=fn=>db.transaction(fn,['calls','users','conversations','messages','notifications','pushDevices']);
 let lifecycle:Promise<unknown>=Promise.resolve();
 const ordered=<T>(fn:()=>Promise<T>)=>{const task=lifecycle.then(fn);lifecycle=task.catch(()=>{});return task;};
 const timers=new Map<string,ReturnType<typeof setTimeout>>();
 async function finish(callId:string,reason:string,allowed?:(c:CallRecord)=>boolean){
  const result=await transaction(s=>{const call=s.calls.find(c=>c.id===callId);if(!call||call.status==='ended'||(allowed&&!allowed(call))||(reason==='timeout'&&Date.parse(call.expiresAt)>Date.now()))return;
   call.status='ended';call.endedAt=new Date().toISOString();call.durationSeconds=call.connectedAt?Math.max(0,Math.floor((Date.parse(call.endedAt)-Date.parse(call.connectedAt))/1000)):0;
   call.outcome=reason==='rejected'?'declined':reason==='busy'?'busy':reason==='timeout'?'no_answer':call.connectedAt&&reason!=='failed'?'completed':reason==='ended'?'missed':'failed';
   if(!s.messages.some(m=>m.clientId===`call:${callId}`))s.messages.push({id:randomUUID(),clientId:`call:${callId}`,conversationId:call.conversationId,senderId:call.callerId,text:'',createdAt:call.endedAt,call:{kind:call.kind,callerId:call.callerId,outcome:call.outcome,durationSeconds:call.durationSeconds,connectedAt:call.connectedAt,endedAt:call.endedAt}});
   enqueueNotification(s,{id:`call-stopped:${callId}`,userId:call.calleeId,category:'calls',event:'call_stopped',resourceId:call.conversationId,callId});return call;
  });if(!result)return false;clearTimeout(timers.get(callId));timers.delete(callId);io.to(`user:${result.callerId}`).to(`user:${result.calleeId}`).emit('call:ended',{callId,reason,outcome:result.outcome,durationSeconds:result.durationSeconds});io.to(`user:${result.callerId}`).to(`user:${result.calleeId}`).emit('message:new',{conversationId:result.conversationId});return true;
 }
 // Signaling is single-instance: sockets from a previous process cannot resume media.
 const recovered=read(s=>s.calls.filter(c=>c.status!=='ended').map(c=>c.id)).then(ids=>Promise.all(ids.map(id=>finish(id,'failed'))));
 const incoming=(call:CallRecord,callerName:string)=>({callId:call.id,conversationId:call.conversationId,caller:{id:call.callerId,name:callerName},kind:call.kind,expiresAt:call.expiresAt});
 const expiry=setInterval(()=>{void read(s=>s.calls.filter(c=>c.status!=='ended'&&Date.parse(c.expiresAt)<Date.now()).map(c=>c.id)).then(ids=>Promise.all(ids.map(id=>finish(id,'timeout')))).catch(()=>{});},5000);expiry.unref();
 io.engine.on('close',()=>{clearInterval(expiry);for(const timer of timers.values())clearTimeout(timer);});
 io.use(async(socket,next)=>{try{await recovered;const a=await authenticateSocket(db,socket.handshake.headers.cookie);if(!a?.user||a.user.banned||socket.handshake.auth.csrfToken!==a.session.csrfToken)return next(new Error('sign_in_required'));socket.data.user=a.user;socket.data.expiresAt=a.session.expiresAt;next();}catch{next(new Error('sign_in_required'));}});
 io.on('connection',socket=>{const userId:string=socket.data.user.id;socket.join(`user:${userId}`);
  const sessionTimer=setTimeout(()=>socket.disconnect(true),Math.min(2147483647,Math.max(1,Date.parse(socket.data.expiresAt)-Date.now())));
  let attempts=0,windowAt=Date.now();
  const withAck=(fn:(payload:any)=>Promise<unknown>,serial=true)=>(payload:unknown,ack?:(r:unknown)=>void)=>{const run=async()=>{try{if(Date.now()-windowAt>60000){attempts=0;windowAt=Date.now();}if(++attempts>300)throw Error();const a=await authenticateSocket(db,socket.handshake.headers.cookie);if(!a?.user||a.user.banned){socket.disconnect(true);throw Error();}socket.data.user=a.user;const result=await fn(payload);ack?.(result);}catch{ack?.({error:'not_allowed'});}};if(serial)void ordered(run);else void run();};
  async function sync(){const pending=await read(s=>s.calls.filter(c=>c.calleeId===userId&&c.status==='ringing'&&Date.parse(c.expiresAt)>Date.now()).map(c=>incoming(c,s.users.find(u=>u.id===c.callerId)?.name||'')));for(const c of pending)socket.emit('call:incoming',c);return {ok:true};}
  void sync().catch(()=>{});socket.on('call:sync',withAck(sync,false));
  socket.on('presence:chat',withAck(async p=>{const data=z.object({conversationId:z.string().max(100).nullable(),visible:z.boolean()}).parse(p);const canonical=data.visible&&data.conversationId?await read(s=>{const c=s.conversations.find(c=>c.id===data.conversationId&&c.members.includes(userId));return c?conversationGroup(s,c)[0]?.id:undefined;}):undefined;if(canonical)activeChats.set(socket.id,{userId,conversationId:canonical,expires:Date.now()+45000});else activeChats.delete(socket.id);return {ok:true};},false));
  socket.on('call:invite',withAck(async payload=>{
   if(isStaff(socket.data.user)||!callsAvailable())return {error:'call_unavailable'};
   const input=z.object({conversationId:z.string().max(100),kind:z.enum(['audio','video']),callId:z.string().uuid().optional()}).strict().parse(payload);const id=input.callId||randomUUID();
   const result=await transaction(s=>{if(s.calls.some(c=>c.id===id))return {error:'not_allowed'};const requested=s.conversations.find(c=>c.id===input.conversationId&&c.members.includes(userId)&&c.members.length===2);if(!requested)return {error:'not_allowed'};const c=conversationGroup(s,requested)[0];const calleeId=c.members.find(id=>id!==userId)!;const callee=s.users.find(u=>u.id===calleeId);if(!callee||callee.banned||isStaff(callee))return {error:'not_allowed'};
    const busy=s.calls.some(c=>c.status!=='ended'&&Date.parse(c.expiresAt)>Date.now()&&[c.callerId,c.calleeId].some(id=>id===userId||id===calleeId));
    const offline=!io.sockets.adapter.rooms.get(`user:${calleeId}`)?.size&&!s.pushDevices.some(d=>d.userId===calleeId);
    const call:CallRecord={id,conversationId:c.id,callerId:userId,calleeId,callerSocket:socket.id,kind:input.kind,status:'ringing',connectedBy:[],createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30000).toISOString()};s.calls.push(call);
    if(!busy&&!offline)enqueueNotification(s,{id:`incoming:${id}`,userId:calleeId,category:'calls',event:'incoming_call',resourceId:c.id,callId:id});return {call,busy,offline};
   });if('error'in result)return result;const {call,busy,offline}=result;
   if(busy||offline){await finish(id,busy?'busy':'ended');return {error:busy?'busy':'offline'};}
   timers.set(id,setTimeout(()=>void finish(id,'timeout').catch(()=>{}),30000));io.to(`user:${call.calleeId}`).emit('call:incoming',incoming(call,socket.data.user.name));return {callId:id,status:'ringing'};
  }));
  socket.on('call:accept',withAck(async p=>{const {callId}=z.object({callId:z.string()}).parse(p);if(!await read(s=>s.calls.some(c=>c.id===callId&&c.calleeId===userId)))return {error:'not_allowed'};const call=await transaction(s=>{const c=s.calls.find(c=>c.id===callId&&c.calleeId===userId&&c.status==='ringing'&&Date.parse(c.expiresAt)>Date.now());if(!c)return;c.status='active';c.calleeSocket=socket.id;c.expiresAt=new Date(Date.now()+2*3600000).toISOString();enqueueNotification(s,{id:`call-answered:${callId}`,userId,category:'calls',event:'call_stopped',resourceId:c.conversationId,callId});return c;});if(!call)return {error:'answered_elsewhere'};clearTimeout(timers.get(callId));timers.set(callId,setTimeout(()=>void finish(callId,'duration_limit').catch(()=>{}),2*3600000));socket.to(`user:${userId}`).emit('call:answered_elsewhere',{callId});io.to(call.callerSocket).emit('call:accepted',{callId,conversationId:call.conversationId,kind:call.kind});return {ok:true,callId};}));
  socket.on('call:connected',withAck(async p=>{const {callId}=z.object({callId:z.string()}).strict().parse(p);const call=await transaction(s=>{const c=s.calls.find(c=>c.id===callId&&c.status==='active');if(!c||![c.callerSocket,c.calleeSocket].includes(socket.id))return;if(!c.connectedBy.includes(socket.id))c.connectedBy.push(socket.id);if(c.connectedBy.length===2&&!c.connectedAt)c.connectedAt=new Date().toISOString();return c;});if(!call)return {error:'not_allowed'};if(call.connectedAt)io.to(call.callerSocket).to(call.calleeSocket!).emit('call:connected',{callId,connectedAt:call.connectedAt});return {ok:true};}));
  for(const event of ['call:reject','call:end'])socket.on(event,withAck(async p=>{const {callId,reason}=z.object({callId:z.string(),reason:z.enum(['ended','failed']).optional()}).parse(p);const c=await read(s=>s.calls.find(c=>c.id===callId));if(!c||c.status==='ended'||![c.callerId,c.calleeId].includes(userId))return {error:'not_allowed'};if(event==='call:reject'&&!(c.calleeId===userId&&c.status==='ringing'))return {error:'not_allowed'};if(event==='call:end'&&![c.callerSocket,c.calleeSocket].includes(socket.id))return {error:'not_allowed'};const ended=await finish(callId,event==='call:reject'?'rejected':reason||'ended',record=>event==='call:reject'?record.status==='ringing'&&record.calleeId===userId:[record.callerSocket,record.calleeSocket].includes(socket.id));return ended?{ok:true}:{error:'not_allowed'};}));
  socket.on('call:signal',withAck(async p=>{const input=z.object({callId:z.string(),signal:z.union([z.object({type:z.enum(['offer','answer']),sdp:z.string().max(30000)}),z.object({candidate:z.string().max(4000),sdpMid:z.string().max(100).nullable().optional(),sdpMLineIndex:z.number().int().nonnegative().nullable().optional(),usernameFragment:z.string().max(200).nullable().optional()})])}).parse(p);const c=await read(s=>s.calls.find(c=>c.id===input.callId));if(!c||c.status!=='active'||![c.callerSocket,c.calleeSocket].includes(socket.id))return {error:'not_allowed'};io.to(c.callerSocket===socket.id?c.calleeSocket!:c.callerSocket).emit('call:signal',{callId:c.id,signal:input.signal});return {ok:true};},false));
  socket.on('disconnect',()=>{clearTimeout(sessionTimer);activeChats.delete(socket.id);void ordered(async()=>{const ids=await read(s=>s.calls.filter(c=>c.status!=='ended'&&(c.callerSocket===socket.id||c.calleeSocket===socket.id)).map(c=>c.id));await Promise.all(ids.map(id=>finish(id,'disconnected')));}).catch(()=>{});});
 });return io;
}
