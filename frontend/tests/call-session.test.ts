import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCallSession} from '../src/lib/call-session';

const deferred=()=>{let resolve!:(value:any)=>void;const promise=new Promise<any>(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(overrides:Record<string,any>={}){
 const handlers=new Map<string,any>(),sent:any[]=[],views:any[]=[],notices:string[]=[],tracks:any[]=[],peers:any[]=[];
 let next=0,iceRequests=0;
 const socket:any={connected:true,on:(name:string,fn:any)=>handlers.set(name,fn),off:(name:string)=>handlers.delete(name),timeout:()=>socket,emit:(name:string,data:any,ack:any)=>sent.push({name,data,ack})};
 const session=createCallSession({socket,id:()=>`attempt-${++next}`,ice:async()=>{iceRequests++;return {available:true,iceServers:[],expiresIn:7500};},conversation:async()=> 'chat',
 media:async()=>{const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);return {getTracks:()=>[track]} as any;},
 peer:()=>{const p:any={closed:false,close(){this.closed=true;},addTrack(){},createOffer:async()=>({type:'offer',sdp:'offer'}),createAnswer:async()=>({type:'answer',sdp:'answer'}),setLocalDescription:async()=>{},setRemoteDescription:async(value:any)=>{p.remoteDescription=value;},addIceCandidate:async()=>{}};peers.push(p);return p;},
 change:(call,status)=>views.push({call,status}),local:()=>{},remote:()=>{},connected:()=>{},notice:key=>notices.push(key),...overrides});
 return {session,socket,handlers,sent,views,tracks,peers,notices,iceRequests:()=>iceRequests,last:()=>views.at(-1),event:(name:string,data:any)=>handlers.get(name)?.(data)};
}
test('calling is immediate, repeat clicks are ignored and hangup cancels an unacknowledged invite',async()=>{
 const ice=deferred(),h=setup({ice:()=>ice.promise});const work=h.session.start({conversationId:'chat',kind:'audio'});
 assert.equal(h.last().status,'calling');assert.equal(h.last().call.callId,'attempt-1');
 await h.session.start({conversationId:'chat',kind:'audio'});assert.equal(h.views.length,1);
 ice.resolve({available:true,iceServers:[],expiresIn:7500});await work;
 const invite=h.sent.find(e=>e.name==='call:invite');assert.equal(invite.data.callId,'attempt-1');
 h.session.end();assert.equal(h.last().call,null);assert.ok(h.tracks[0].stopped);assert.ok(h.peers[0].closed);
 assert.equal(h.sent.at(-1).name,'call:end');assert.equal(h.sent.at(-1).data.callId,'attempt-1');
 invite.ack(null,{callId:'attempt-1'});assert.equal(h.last().call,null);h.session.dispose();
});
test('a slow old attempt cannot close a new callback or resurrect media',async()=>{
 const firstMedia=deferred();let count=0;const oldTrack={stopped:false,stop(){this.stopped=true;}};
 const h=setup({media:()=>++count===1?firstMedia.promise:Promise.resolve({getTracks:()=>[]})});
 const first=h.session.start({conversationId:'chat',kind:'video'});h.session.end();
 await h.session.start({conversationId:'chat',kind:'audio'});
 firstMedia.resolve({getTracks:()=>[oldTrack]});await first;
 assert.ok(oldTrack.stopped);assert.equal(h.last().call.callId,'attempt-2');assert.equal(h.sent.filter(e=>e.name==='call:invite').length,1);
 h.session.dispose();
});
test('late accepted events can connect before invite acknowledgement, and redial reuses fresh ICE',async()=>{
 const h=setup();await h.session.start({conversationId:'chat',kind:'audio'});
 const first=h.sent.find(e=>e.name==='call:invite');await h.event('call:accepted',{callId:'attempt-1'});
 first.ack(null,{callId:'attempt-1'});assert.equal(h.last().status,'connecting');
 h.session.end();await h.session.start({conversationId:'chat',kind:'audio'});
 first.ack(Error('late timeout'));h.event('call:ended',{callId:'attempt-1'});
 assert.equal(h.last().call.callId,'attempt-2');assert.equal(h.iceRequests(),1);
 const second=h.sent.filter(e=>e.name==='call:invite')[1];second.ack(null,{callId:'attempt-2'});assert.equal(h.last().status,'ringing');
 second.ack(Error('timeout'));assert.equal(h.last().call,null);assert.equal(h.sent.at(-1).data.callId,'attempt-2');h.session.dispose();
});
test('answer updates immediately and cancelling media preparation rejects the ringing call',async()=>{
 const media=deferred(),track={stopped:false,stop(){this.stopped=true;}},h=setup({media:()=>media.promise});
 h.event('call:incoming',{callId:'incoming',kind:'audio'});const answer=h.session.answer();assert.equal(h.last().status,'connecting');assert.equal(h.last().call.incoming,false);
 h.session.end();assert.equal(h.last().call,null);assert.equal(h.sent.at(-1).name,'call:reject');
 media.resolve({getTracks:()=>[track]});await answer;assert.ok(track.stopped);assert.equal(h.sent.some(e=>e.name==='call:accept'),false);h.session.dispose();
});
test('ICE candidates arriving during remote description are drained in order',async()=>{
 const description=deferred(),candidates:any[]=[];const p:any={close(){},addTrack(){},setRemoteDescription:async(value:any)=>{await description.promise;p.remoteDescription=value;},addIceCandidate:async(c:any)=>{candidates.push(c);},createAnswer:async()=>({type:'answer',sdp:'ok'}),setLocalDescription:async()=>{}};
 const h=setup({peer:()=>p});h.event('call:incoming',{callId:'incoming',kind:'audio'});await h.session.answer();
 h.event('call:signal',{callId:'incoming',signal:{candidate:'first'}});h.event('call:signal',{callId:'incoming',signal:{type:'offer',sdp:'remote'}});await tick();
 h.event('call:signal',{callId:'incoming',signal:{candidate:'second'}});description.resolve(null);await tick();
 assert.deepEqual(candidates.map(c=>c.candidate),['first','second']);assert.ok(h.sent.some(e=>e.name==='call:signal'&&e.data.signal.type==='answer'));h.session.dispose();
});
