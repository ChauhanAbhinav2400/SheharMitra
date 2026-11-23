import assert from 'node:assert/strict';
const origin=process.env.SMOKE_SITE_ORIGIN||'http://localhost:3000';
const checks=[['/hi','शहर मित्र'],['/en','SheharMitra'],['/hi/shops/kisan-tractor-parts','किसान ट्रैक्टर पार्ट्स'],['/en/shops/kisan-tractor-parts','Kisan Tractor Parts'],['/en/login','Sign in'],['/en/signup','Create account'],['/en/orders','Every purchase'],['/en/messages','conversation'],['/en/profile','neighbourhood'],['/manifest.webmanifest','शहर मित्र'],['/robots.txt','Disallow'],['/sitemap.xml','hreflang']];
for(const [path,content] of checks){const response=await fetch(origin+path);assert.equal(response.status,200,path);const body=await response.text();assert.ok(body.includes(content),`${path}: expected content`);if(path.includes('/shops/'))assert.ok(body.includes('LocalBusiness'),`${path}: structured data`);console.log(`PASS ${path}`);}
const privateHtml=await (await fetch(origin+'/en/orders')).text();assert.ok(!privateHtml.includes('order-bearing'),'Private data must not leak into unauthenticated HTML');
console.log('PASS private order content excluded from unauthenticated HTML');
