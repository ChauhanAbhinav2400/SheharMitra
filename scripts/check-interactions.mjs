// Isolated browser smoke test: synthetic local accounts and fake media only.
// No live Mongo, SMS, S3, push, or TURN credentials are used.
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {mkdirSync,createWriteStream} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const root=resolve(import.meta.dirname,'..'),run=Date.now();
mkdirSync(resolve(root,'.data'),{recursive:true});
const log=createWriteStream(resolve(root,'.data/interaction-browser.log'));
const children=[];let browser;
function start(args,cwd,env){const child=spawn(process.execPath,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,...env}});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});children.push(child);return child;}
async function ready(url){for(let i=0;i<100;i++){if(children.some(p=>p.exitCode!==null))throw Error('Preview server stopped; see .data/interaction-browser.log');try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Preview timeout');}
const api='http://localhost:4100/api',origin='http://localhost:3100';
try{
 start(['--import','tsx','src/server.ts'],resolve(root,'backend'),{NODE_ENV:'development',PORT:'4100',API_ORIGIN:'http://localhost:4100',FRONTEND_ORIGINS:origin,DATABASE_ADAPTER:'local',DATA_FILE:`./.data/interaction-${run}.json`,STORAGE_ADAPTER:'local',UPLOAD_DIR:'./.data/interaction-uploads',OTP_PROVIDER:'demo',DEMO_SEED:'true',DEMO_PASSWORD:'DemoPass123!',TURN_PROVIDER:'coturn',TURN_URLS:'turn:127.0.0.1:9',TURN_SHARED_SECRET:'synthetic-turn-secret-for-browser-test',FIREBASE_PROJECT_ID:'',FIREBASE_CLIENT_EMAIL:'',FIREBASE_PRIVATE_KEY:'',GEOCODING_PROVIDER:'disabled',SESSION_SECRET:'synthetic-preview-session-not-for-production'});
 start([resolve(root,'node_modules/next/dist/bin/next'),'dev','-p','3100'],resolve(root,'frontend'),{NEXT_DIST_DIR:'.next-interactions',NEXT_PUBLIC_API_URL:api,API_INTERNAL_URL:api,NEXT_PUBLIC_SOCKET_URL:'http://localhost:4100',NEXT_PUBLIC_SITE_ORIGIN:origin,NEXT_PUBLIC_DEMO_MODE:'true',NEXT_PUBLIC_AUTH_PROVIDER:'demo',NEXT_PUBLIC_FIREBASE_VAPID_KEY:'',NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:''});
 await Promise.all([ready('http://localhost:4100/health'),ready(origin+'/en')]);
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 async function account(phone){
  const context=await browser.newContext({permissions:['microphone','camera']});
  const csrf=(await (await context.request.get(api+'/auth/me')).json()).csrfToken;
  const r=await context.request.post(api+'/auth/login',{headers:{Origin:origin,'X-CSRF-Token':csrf},data:{phone,password:'DemoPass123!'}});expect(r.status()).toBe(200);
  const token=(await r.json()).csrfToken;
  const send=(path,data,method='POST')=>context.request.fetch(api+path,{method,headers:{Origin:origin,'X-CSRF-Token':token},data});
  // Exercise real browser WebRTC over loopback, independently of external TURN.
  await context.route('**/api/calls/ice',async route=>{await new Promise(r=>setTimeout(r,700));await route.fulfill({json:{available:true,expiresIn:7500,iceServers:[]}});});
  return {context,send,page:await context.newPage()};
 }
 const buyer=await account('9000000001'),seller=await account('9000000002');
 const thread=await buyer.send('/conversations',{shopId:'shop-tractor-parts'});expect(thread.status()).toBe(201);const id=(await thread.json()).conversation.id;
 await Promise.all([buyer.page.goto(`${origin}/en/messages/${id}`),seller.page.goto(`${origin}/en/messages/${id}`)]);
 await Promise.all([expect(buyer.page.getByRole('button',{name:'Audio call',exact:true})).toBeVisible(),expect(seller.page.getByRole('button',{name:'Audio call',exact:true})).toBeVisible()]);
 await buyer.page.waitForTimeout(400);
 async function call(from,to,kind){
  await from.page.getByRole('button',{name:kind+' call',exact:true}).click();
  await expect(from.page.locator('.call-panel')).toBeVisible({timeout:600});
  await expect(to.page.getByRole('button',{name:'Answer',exact:true})).toBeVisible({timeout:15000});
  await to.page.getByRole('button',{name:'Answer',exact:true}).click();
  await Promise.all([expect(from.page.locator('.call-panel [role="status"]')).toHaveText('Connected',{timeout:20000}),expect(to.page.locator('.call-panel [role="status"]')).toHaveText('Connected',{timeout:20000})]);
 }
 await call(buyer,seller,'Audio');
 await buyer.page.getByRole('button',{name:'End call',exact:true}).click();await expect(buyer.page.locator('.call-panel')).toHaveCount(0,{timeout:600});await expect(seller.page.locator('.call-panel')).toHaveCount(0);
 await call(seller,buyer,'Video');
 await seller.page.getByRole('button',{name:'End call',exact:true}).click();await expect(seller.page.locator('.call-panel')).toHaveCount(0,{timeout:600});await expect(buyer.page.locator('.call-panel')).toHaveCount(0);
 console.log('PASS: browser audio call, immediate hangup, reverse video callback, real loopback WebRTC connected on both sides.');
 const partner=await account('9000000003');
 const address={pincode:'246763',state:'Uttar Pradesh',city:'Testing Nagar',locality:'Main Market',line1:'10 Test Lane',line2:''};
 const created=await partner.send('/trips',{originAddress:address,destinationAddress:{...address,city:'Other Nagar'},departureAt:new Date(Date.now()+3600000).toISOString(),arrivalAt:new Date(Date.now()+7200000).toISOString(),transport:'motorcycle',categories:['tractor-parts']});expect(created.status()).toBe(201);
 await partner.page.goto(origin+'/en/my-trips');const card=partner.page.locator('.trip-card').filter({hasText:'Testing Nagar'});await card.getByRole('button',{name:'Edit trip',exact:true}).click();
 await expect(partner.page.getByLabel('Pincode',{exact:true})).toHaveValue('246763');await expect(partner.page.getByLabel('City / town / village',{exact:true})).toHaveValue('Testing Nagar');
 await partner.page.getByRole('button',{name:'Continue',exact:true}).click();await partner.page.getByRole('button',{name:'Continue',exact:true}).click();
 await expect(partner.page.getByRole('button',{name:'Save trip',exact:true})).toBeVisible();
 await partner.page.getByRole('button',{name:'Save trip',exact:true}).click();await expect(partner.page.getByRole('button',{name:'Save trip',exact:true})).toHaveCount(0,{timeout:15000});
 console.log('PASS: trip editor prefilled addresses and saved through the API.');
}finally{
 await browser?.close();for(const child of children)child.kill();log.end();
}
