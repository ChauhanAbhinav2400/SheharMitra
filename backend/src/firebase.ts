import {cert,getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {config} from './config.js';
import {ensure,HttpError} from './errors.js';
export type VerifiedPhone={uid:string;phone:string};
export async function verifyFirebasePhone(idToken:string):Promise<VerifiedPhone>{
  ensure(config.otpProvider==='firebase',503,'otp_unavailable');
  try{
    const app=firebaseAdminApp();
    const token=await getAuth(app).verifyIdToken(idToken,true);
    ensure(token.firebase.sign_in_provider==='phone'&&typeof token.phone_number==='string'&&/^\+91[6-9]\d{9}$/.test(token.phone_number),401,'firebase_invalid_token');
    ensure(Date.now()/1000-token.auth_time<=300&&token.auth_time<=Date.now()/1000+30,401,'firebase_reauthenticate');
    return {uid:token.uid,phone:token.phone_number!.slice(3)};
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(401,'firebase_invalid_token');}
}

export function firebaseAdminApp(){return getApps().find(a=>a.name==='sheharmitra-auth')||initializeApp({projectId:config.firebase.projectId,credential:config.firebase.clientEmail&&config.firebase.privateKey?cert({projectId:config.firebase.projectId,clientEmail:config.firebase.clientEmail,privateKey:config.firebase.privateKey.replace(/\\n/g,'\n')}):applicationDefault()},'sheharmitra-auth');}
