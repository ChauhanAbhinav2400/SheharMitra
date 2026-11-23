export type CallTarget = {conversationId?:string;shopId?:string;orderId?:string;recipientId?:string;kind:'audio'|'video'};
type Dependencies = {
  socket:any;
  ice:()=>Promise<any>;
  conversation:(target:CallTarget)=>Promise<string>;
  media:(kind:string)=>Promise<MediaStream>;
  peer:(iceServers:RTCIceServer[])=>RTCPeerConnection;
  id:()=>string;
  change:(call:any,status:string)=>void;
  local:(stream:MediaStream|null,peer:RTCPeerConnection|null)=>void;
  remote:(stream:MediaStream)=>void;
  connected:(at:string)=>void;
  notice:(key:string)=>void;
};

// One attempt owns its media and callbacks. Late work cannot touch a newer call.
export function createCallSession(d:Dependencies) {
  let active:any=null, disposed=false;
  let iceCache:{value:any;expires:number}|undefined;
  let iceRequest:Promise<any>|undefined;
  const live=(a:any)=>!disposed&&active===a;
  function show(a:any,status:string){if(live(a)){a.status=status;d.change({...a.view},status);}}
  function clear(a:any){
    a.peer?.close();a.stream?.getTracks().forEach((t:MediaStreamTrack)=>t.stop());
    if(active!==a)return;
    active=null;d.local(null,null);d.change(null,'call_ended');
  }
  function stop(a:any,event='call:end',reason?:string){
    // The client chooses the ID before inviting, so cancellation works even before ACK.
    if(a.invited)d.socket.emit(event,{callId:a.view.callId,...(reason?{reason}:{})});
    clear(a);
  }
  async function ice(){
    if(iceCache&&iceCache.expires>Date.now())return iceCache.value;
    if(!iceRequest)iceRequest=d.ice().then(value=>{
      if(!value.available)throw Error('call_unavailable');
      iceCache={value,expires:Date.now()+Math.max(0,Math.min(300,Number(value.expiresIn||0)-60))*1000};
      return value;
    }).finally(()=>{iceRequest=undefined;});
    return iceRequest;
  }
  async function prepare(a:any){
    const cfgPromise=ice();void cfgPromise.catch(()=>{});
    const media=await d.media(a.view.kind);
    if(!live(a)){media.getTracks().forEach(t=>t.stop());return;}
    a.stream=media;
    const cfg=await cfgPromise;if(!live(a))return;
    const p=d.peer(cfg.iceServers);a.peer=p;
    media.getTracks().forEach(track=>p.addTrack(track,media));d.local(media,p);
    p.onicecandidate=e=>{if(e.candidate&&live(a))d.socket.emit('call:signal',{callId:a.view.callId,signal:e.candidate.toJSON()});};
    p.ontrack=e=>{if(live(a))d.remote(e.streams[0]);};
    p.onconnectionstatechange=()=>{
      if(!live(a))return;
      if(p.connectionState==='connected'){show(a,'call_connected');d.socket.emit('call:connected',{callId:a.view.callId});}
      if(p.connectionState==='disconnected')show(a,'call_reconnecting');
      if(p.connectionState==='failed'){stop(a,'call:end','failed');d.notice('call_unavailable');}
    };
  }
  function make(view:any,invited=false){return {status:'',view,invited,received:!!view.incoming,acceptSent:false,preparing:false,candidates:[] as RTCIceCandidateInit[],signals:Promise.resolve(),peer:null as RTCPeerConnection|null,stream:null as MediaStream|null};}
  async function start(target:CallTarget){
    if(disposed||active)return;
    const a=make({...target,callId:d.id(),incoming:false});active=a;a.preparing=true;
    show(a,'calling');
    if(!d.socket.connected){clear(a);d.notice('call_unavailable');return;}
    try{
      const conversation=target.conversationId?Promise.resolve(target.conversationId):d.conversation(target);
      void conversation.catch(()=>{});
      const [,conversationId]=await Promise.all([prepare(a),conversation]);
      if(!live(a))return;
      a.view.conversationId=conversationId;a.invited=true;
      d.socket.timeout(45000).emit('call:invite',{conversationId,kind:target.kind,callId:a.view.callId},(err:any,result:any)=>{
        if(!live(a))return;
        if(err||result?.error){stop(a);d.notice(result?.error==='busy'?'busy':'call_unavailable');return;}
        a.preparing=false;
        if(a.status==='calling')show(a,'ringing');
      });
    }catch(e){if(live(a)){stop(a);d.notice((e as Error).name==='NotAllowedError'?'permission_error':'call_unavailable');}}
  }
  const incoming=(view:any)=>{
    if(active?.view.callId===view.callId)return;
    if(active){d.socket.emit('call:reject',{callId:view.callId});return;}
    const a=make({...view,incoming:true},true);active=a;show(a,'incoming_call');
  };
  async function answer(){
    const a=active;if(!a||!a.view.incoming||a.preparing)return;
    a.preparing=true;a.view.incoming=false;show(a,'connecting');
    try{
      await prepare(a);if(!live(a))return;
      a.acceptSent=true;
      d.socket.timeout(45000).emit('call:accept',{callId:a.view.callId},(err:any,result:any)=>{
        if(!live(a))return;
        if(err||result?.error){stop(a,'call:end');d.notice(result?.error==='answered_elsewhere'?'answered_elsewhere':'call_unavailable');return;}
        a.preparing=false;
      });
    }catch{if(live(a)){stop(a,'call:reject');d.notice('permission_error');}}
  }
  const accepted=async(data:any)=>{
    const a=active;if(!a||a.view.callId!==data.callId||!a.peer)return;
    try{
      show(a,'connecting');const offer=await a.peer.createOffer();if(!live(a))return;
      await a.peer.setLocalDescription(offer);if(live(a))d.socket.emit('call:signal',{callId:data.callId,signal:offer});
    }catch{if(live(a))stop(a,'call:end','failed');}
  };
  const signal=(data:any)=>{
    const a=active;if(!a||data.callId!==a.view.callId||!a.peer)return;
    // ICE candidates may arrive while setRemoteDescription is still awaiting.
    a.signals=a.signals.then(async()=>{
      if(!live(a))return;const p=a.peer!;
      if(data.signal.type){
        await p.setRemoteDescription(data.signal);if(!live(a))return;
        for(const c of a.candidates)await p.addIceCandidate(c);a.candidates=[];
        if(data.signal.type==='offer'){
          const answer=await p.createAnswer();if(!live(a))return;await p.setLocalDescription(answer);
          if(live(a))d.socket.emit('call:signal',{callId:data.callId,signal:answer});
        }
      }else if(p.remoteDescription)await p.addIceCandidate(data.signal);else a.candidates.push(data.signal);
    }).catch(()=>{if(live(a))stop(a,'call:end','failed');});
  };
  const ended=(data:any)=>{if(active?.view.callId===data.callId){clear(active);d.notice('call_ended');}};
  const elsewhere=(data:any)=>{if(active?.view.callId===data.callId){clear(active);d.notice('answered_elsewhere');}};
  const connected=(data:any)=>{if(active?.view.callId===data.callId)d.connected(data.connectedAt);};
  const disconnect=()=>{if(active){clear(active);d.notice('call_unavailable');}};
  const sync=()=>d.socket.emit('call:sync',{});
  const handlers:Record<string,any>={'call:incoming':incoming,'call:accepted':accepted,'call:signal':signal,'call:ended':ended,'call:answered_elsewhere':elsewhere,'call:connected':connected,disconnect,connect:sync};
  for(const [name,handler] of Object.entries(handlers))d.socket.on(name,handler);
  if(d.socket.connected)sync();
  return {start,answer,end:()=>{if(active)stop(active,active.received&&!active.acceptSent?'call:reject':'call:end');},dispose:()=>{
    if(active)stop(active,active.received&&!active.acceptSent?'call:reject':'call:end');disposed=true;
    for(const [name,handler] of Object.entries(handlers))d.socket.off(name,handler);
  }};
}
