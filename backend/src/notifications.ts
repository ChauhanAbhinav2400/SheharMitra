import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {rateLimit} from 'express-rate-limit';
import {getMessaging,type Message} from 'firebase-admin/messaging';
import {requireAuth} from './auth.js';
import {firebaseAdminApp} from './firebase.js';
import {notificationText,viewingChat} from './notification-events.js';
import type {Store} from './data/store.js';
import type {Server} from 'socket.io';
import {isStaff,isResolver} from './roles.js';

export function notificationPath(n:{category:string;resourceId:string},lang:string,user?:{roles:string[]}){if(user?.roles.includes('admin'))return n.category==='disputes'?'/admin/disputes':'/admin';if(isResolver(user))return n.category==='disputes'?'/resolver/'+encodeURIComponent(n.resourceId):'/resolver';return n.category==='messages'||n.category==='calls'?`/${lang}/messages/${encodeURIComponent(n.resourceId)}`:n.category==='verification'?`/${lang}/profile`:`/${lang}/orders/${encodeURIComponent(n.resourceId)}`;}
export function createNotificationRouter(db:Store){const router=Router();router.use(requireAuth,rateLimit({windowMs:60000,limit:90}));
 router.get('/',async(req,res)=>res.json(await db.read(s=>{const user=s.users.find(u=>u.id===req.user!.id)!;const lang=user.language==='hi'?'hi':'en';const all=s.notifications.filter(n=>n.userId===user.id&&n.event!=='call_stopped');return {notifications:all.slice(-100).reverse().map(n=>({...n,text:notificationText(n,lang),url:notificationPath(n,lang,user)})),unread:all.filter(n=>!n.readAt).length,settings:user.notificationSettings||{},language:lang};})));
 router.post('/read',async(req,res)=>{const {id}=z.object({id:z.string().max(200).optional()}).strict().parse(req.body);await db.transaction(s=>{for(const n of s.notifications)if(n.userId===req.user!.id&&(!id||n.id===id))n.readAt=new Date().toISOString();});res.json({ok:true});});
 router.post('/settings',async(req,res)=>{const input=z.object({language:z.enum(['en','hi']),categories:z.object({messages:z.boolean(),orders:z.boolean(),disputes:z.boolean(),verification:z.boolean(),calls:z.boolean()}).partial()}).strict().parse(req.body);await db.transaction(s=>{const u=s.users.find(u=>u.id===req.user!.id)!;u.language=input.language;u.notificationSettings={...u.notificationSettings,...input.categories};});res.json({ok:true});});
 router.post('/devices',async(req,res)=>{const input=z.object({deviceId:z.string().min(8).max(100),token:z.string().min(20).max(4096),language:z.enum(['en','hi'])}).strict().parse(req.body);await db.transaction(s=>{s.pushDevices=s.pushDevices.filter(d=>d.token!==input.token&&!(d.userId===req.user!.id&&d.deviceId===input.deviceId));s.pushDevices.push({...input,id:randomUUID(),userId:req.user!.id,sessionId:req.session!.id,updatedAt:new Date().toISOString()});const devices=s.pushDevices.filter(d=>d.userId===req.user!.id);if(devices.length>20){const remove=new Set(devices.slice(0,devices.length-20).map(d=>d.id));s.pushDevices=s.pushDevices.filter(d=>!remove.has(d.id));}});res.json({ok:true});});
 router.delete('/devices',async(req,res)=>{const {deviceId}=z.object({deviceId:z.string().max(100)}).strict().parse(req.body);await db.transaction(s=>{s.pushDevices=s.pushDevices.filter(d=>!(d.userId===req.user!.id&&d.deviceId===deviceId));});res.json({ok:true});});return router;
}
export function startNotifications(db:Store,io:Server,send:(message:Message)=>Promise<string>=message=>getMessaging(firebaseAdminApp()).send(message)){
 const read:Store['read']=fn=>db.read(fn,['notifications','users','pushDevices','sessions','calls']);
 const transaction:Store['transaction']=fn=>db.transaction(fn,['notifications','users','pushDevices']);
 let busy=false;const run=async()=>{if(busy)return;busy=true;try{
 const pending=await read(s=>s.notifications.filter(n=>n.pushState==='pending'||(n.pushState==='sending'&&Date.parse(n.retryAt||'')<Date.now())).slice(0,30));
 for(const candidate of pending){const batch=await transaction(s=>{const n=s.notifications.find(n=>n.id===candidate.id);if(!n||n.pushState==='sent'||(n.pushState==='sending'&&Date.parse(n.retryAt||'')>Date.now()))return;const user=s.users.find(u=>u.id===n.userId);if(!user||user.banned){n.pushState='sent';return;}n.pushState='sending';n.retryAt=new Date(Date.now()+60000).toISOString();return {n,user,devices:s.pushDevices.filter(d=>d.userId===n.userId)};});if(!batch)continue;
 const {n,user,devices}=batch;io.to(`user:${user.id}`).emit('notification:new',{id:n.id});
 let retry=false;const invalid:string[]=[];
 if((n.event==='call_stopped'||user.notificationSettings?.[n.category]!==false)&&!(n.category==='messages'&&viewingChat(user.id,n.resourceId))&&!(n.category==='calls'&&Date.now()-Date.parse(n.createdAt)>30000)){
 for(const d of devices){if(n.deliveredDevices?.includes(d.id))continue;const valid=await read(s=>!s.users.find(u=>u.id===user.id)?.banned&&s.pushDevices.some(x=>x.id===d.id&&x.sessionId===d.sessionId)&&s.sessions.some(x=>x.id===d.sessionId&&Date.parse(x.expiresAt)>Date.now())&&(n.event!=='incoming_call'||s.calls.some(c=>c.id===n.callId&&c.status==='ringing'&&Date.parse(c.expiresAt)>Date.now())));if(!valid)continue;try{const lang=d.language;await send({token:d.token,data:{notificationId:n.id,type:n.event,conversationId:['calls','messages'].includes(n.category)?n.resourceId:'',callId:n.callId||'',title:lang==='hi'?'शहर मित्र':'SheharMitra',body:notificationText(n,lang),url:notificationPath(n,lang,user)},webpush:{headers:{Urgency:n.category==='calls'?'high':'normal',TTL:n.category==='calls'?'30':'3600'}}});await transaction(s=>{const saved=s.notifications.find(x=>x.id===n.id);if(saved)saved.deliveredDevices=[...new Set([...(saved.deliveredDevices||[]),d.id])];});}catch(error){const code=(error as {code?:string}).code;if(['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(code||''))invalid.push(d.id);else retry=true;}}
 }
 await transaction(s=>{s.pushDevices=s.pushDevices.filter(d=>!invalid.includes(d.id));const saved=s.notifications.find(x=>x.id===n.id);if(saved){saved.attempts=(saved.attempts||0)+1;saved.pushState=retry&&saved.attempts<4?'sending':'sent';saved.retryAt=new Date(Date.now()+60000).toISOString();}});
 }
 }catch{console.error('Notification delivery will retry.');}finally{busy=false;}};const timer=setInterval(()=>void run(),2000);timer.unref();return Object.assign(()=>clearInterval(timer),{flush:run});}
