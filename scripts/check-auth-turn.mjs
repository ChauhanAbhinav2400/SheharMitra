// Provider checks never print secrets, tokens, user records, or test phone numbers.
import {readFileSync, writeFileSync} from 'node:fs';
import {createPrivateKey, sign} from 'node:crypto';
import {parse} from 'dotenv';

const backendPath = new URL('../backend/.env', import.meta.url);
const frontendPath = new URL('../frontend/.env.local', import.meta.url);
const backend = parse(readFileSync(backendPath));
const frontend = parse(readFileSync(frontendPath));
const sync = process.argv.includes('--sync-web-config');
let failed = false;
function fail(message) { failed = true; console.log(message); }
function updateEnv(path, changes) {
  let text = readFileSync(path, 'utf8');
  for (const [key, value] of Object.entries(changes)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(path, text);
}
async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(20000)});
  const data = await response.json().catch(() => ({}));
  // Do not propagate provider response bodies: they may contain sensitive data.
  if (!response.ok) {
    const reason = data.error?.message;
    const code = typeof reason === 'string' && /^[A-Z][A-Z0-9_]{2,80}$/.test(reason) ? ` ${reason}` : '';
    throw new Error(`HTTP ${response.status}${code}`);
  }
  return data;
}
function safeError(error) {
  return /^HTTP \d{3}( [A-Z][A-Z0-9_]{2,80})?$/.test(error.message) ? error.message : 'connection or configuration error';
}
async function checkFirebase() {
  try {
    for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
      if (!backend[key]) { fail(`Firebase: missing ${key}.`); return; }
    }
    const key = createPrivateKey(backend.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'));
    const now = Math.floor(Date.now() / 1000);
    const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encoded({alg: 'RS256', typ: 'JWT'})}.${encoded({
      iss: backend.FIREBASE_CLIENT_EMAIL,
      scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    })}`;
    const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
    const token = await jsonRequest('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion}),
    });
    if (!token.access_token) throw new Error('Missing access token');
    console.log('Firebase service account: Google accepted the credentials.');
    const headers = {Authorization: `Bearer ${token.access_token}`};
    const project = encodeURIComponent(backend.FIREBASE_PROJECT_ID);
    try {
      const billing = await jsonRequest(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`, {headers});
      if (billing.billingEnabled === true) console.log('Google Cloud project billing: enabled (this does not prove SMS billing activation or available quota).');
      else fail('Google Cloud project billing: NOT enabled. Check the billing account linked to this Firebase project.');
    } catch (error) {
      console.log(`Google Cloud project billing: could not inspect (${safeError(error)}); verify the linked active billing account in the console.`);
    }
    try {
      const config = await jsonRequest(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`, {headers});
      if (config.signIn?.phoneNumber?.enabled) console.log('Firebase Phone provider: enabled.');
      else fail('Firebase Phone provider: DISABLED. Enable Phone in Authentication > Sign-in method.');
      const regions = config.smsRegionConfig;
      if (regions?.allowlistOnly) {
        if (regions.allowlistOnly.allowedRegions?.includes('IN')) console.log('Firebase SMS region: India allowed.');
        else fail('Firebase SMS region: India is NOT allowed.');
      } else if (regions?.allowByDefault) {
        if (regions.allowByDefault.disallowedRegions?.includes('IN')) fail('Firebase SMS region: India is BLOCKED.');
        else console.log('Firebase SMS region: India allowed.');
      } else fail('Firebase SMS region: no explicit policy returned; check India in the console.');
      const origins = (backend.FRONTEND_ORIGINS || 'http://localhost:3000').split(',').map(value => value.trim());
      for (const origin of origins) {
        const url = new URL(origin);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        const authorized = config.authorizedDomains?.includes(url.hostname);
        console.log(`Firebase frontend domain: ${url.hostname}; authorized: ${authorized ? 'yes' : 'NO'}; HTTPS: ${url.protocol === 'https:' ? 'yes' : 'no'}.`);
        if (local) fail('Real SMS readiness: localhost is unsupported for hosted phone authentication. Use an authorized HTTPS domain.');
        else if (!authorized || url.protocol !== 'https:') fail('Real SMS readiness: configure an authorized HTTPS frontend origin.');
      }
      console.log(`Firebase fictional test numbers configured: ${Object.keys(config.signIn?.phoneNumber?.testPhoneNumbers || {}).length}.`);
    } catch (error) { fail(`Firebase Auth configuration: could not verify (${safeError(error)}).`); }
    try {
      const apps = await jsonRequest(`https://firebase.googleapis.com/v1beta1/projects/${project}/webApps?pageSize=100`, {headers});
      const candidates = (apps.apps || []).filter(app => !app.state || app.state === 'ACTIVE');
      const selected = frontend.NEXT_PUBLIC_FIREBASE_APP_ID
        ? candidates.find(app => app.appId === frontend.NEXT_PUBLIC_FIREBASE_APP_ID)
        : candidates.length === 1 ? candidates[0] : undefined;
      if (!selected) { fail(`Firebase web app: ${candidates.length} app(s) found; select/register the intended web app in Firebase project settings and fill frontend/.env.local.`); return; }
      const config = await jsonRequest(`https://firebase.googleapis.com/v1beta1/${selected.name}/config`, {headers});
      const mapping = {
        NEXT_PUBLIC_FIREBASE_API_KEY: config.apiKey,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: config.authDomain,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: config.projectId,
        NEXT_PUBLIC_FIREBASE_APP_ID: config.appId,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:config.messagingSenderId,
      };
      if (config.projectId !== backend.FIREBASE_PROJECT_ID || Object.values(mapping).some(value => !value)) throw new Error('Incomplete or mismatched web configuration');
      const missing = Object.fromEntries(Object.entries(mapping).filter(([key]) => !frontend[key]));
      const mismatched = Object.keys(mapping).filter(key => frontend[key] && frontend[key] !== mapping[key]);
      if (mismatched.length) fail(`Firebase web configuration: differs from the selected project for ${mismatched.join(', ')}; existing values preserved.`);
      if (Object.keys(missing).length && sync) {
        updateEnv(frontendPath, missing);
        Object.assign(frontend, missing);
        console.log('Firebase web configuration: filled missing frontend values from the existing registered web app.');
      } else if (Object.keys(missing).length) fail(`Firebase web configuration: ${Object.keys(missing).join(', ')} missing (use --sync-web-config to fill from the existing app).`);
      else console.log('Firebase web configuration: matches the registered app.');
    } catch (error) { fail(`Firebase web configuration: could not retrieve (${safeError(error)}). Copy the four web config values from Firebase project settings.`); }
  } catch (error) { fail(`Firebase service account: FAILED (${safeError(error)}).`); }
}
async function checkTurn() {
  if (!backend.CLOUDFLARE_TURN_KEY_ID || !backend.CLOUDFLARE_TURN_API_TOKEN) { fail('Cloudflare TURN: credentials missing.'); return; }
  try {
    const data = await jsonRequest(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(backend.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: {Authorization: `Bearer ${backend.CLOUDFLARE_TURN_API_TOKEN}`, 'Content-Type': 'application/json'}, body: JSON.stringify({ttl: 7500}),
    });
    const servers = data.iceServers;
    if (!Array.isArray(servers) || !servers.some(server => [server.urls].flat().some(url => typeof url === 'string' && /^turns?:/.test(url)) && server.username && server.credential)) throw new Error('No relay credentials');
    console.log(`Cloudflare TURN: accepted; ${servers.length} ICE server entries issued, TTL 7500 seconds. Media still needs a two-device test.`);
  } catch (error) { fail(`Cloudflare TURN: FAILED (${safeError(error)}). Check the TURN key ID and its associated API token.`); }
}
await Promise.all([checkFirebase(), checkTurn()]);
console.log(`Backend OTP_PROVIDER: ${backend.OTP_PROVIDER || 'not set'}.`);
if (backend.OTP_PROVIDER !== 'firebase') fail('Firebase backend sign-in is not enabled. Set OTP_PROVIDER=firebase after validating the credentials.');
if (Object.keys(frontend).filter(key => /^NEXT_PUBLIC_FIREBASE_(API_KEY|AUTH_DOMAIN|PROJECT_ID|APP_ID)$/.test(key) && frontend[key]).length !== 4) failed = true;
console.log('No SMS was sent. Audio/video media was not tested.');
process.exitCode = failed ? 1 : 0;
