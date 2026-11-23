import {readFileSync} from 'node:fs';
import {parse} from 'dotenv';
import mongoose from 'mongoose';
import {S3Client,HeadBucketCommand} from '@aws-sdk/client-s3';
const env=parse(readFileSync(new URL('../backend/.env',import.meta.url)));
let failed=false;
try{await mongoose.connect(env.MONGODB_URI,{serverSelectionTimeoutMS:12000});await mongoose.connection.db.command({ping:1});const hello=await mongoose.connection.db.admin().command({hello:1});console.log(`MongoDB: connected; transaction topology: ${hello.setName||hello.msg==='isdbgrid'?'supported':'NOT replica set'}`);if(!hello.setName&&hello.msg!=='isdbgrid')failed=true;}catch(e){failed=true;console.log(`MongoDB: failed (${e.codeName||e.name}); inspect URI, network access list and database user permissions locally.`);}finally{await mongoose.disconnect();}
try{const client=new S3Client({region:env.S3_REGION,...(env.S3_ENDPOINT?{endpoint:env.S3_ENDPOINT,forcePathStyle:true}:{}),...(env.AWS_ACCESS_KEY_ID&&env.AWS_SECRET_ACCESS_KEY?{credentials:{accessKeyId:env.AWS_ACCESS_KEY_ID,secretAccessKey:env.AWS_SECRET_ACCESS_KEY}}:{})});await client.send(new HeadBucketCommand({Bucket:env.S3_BUCKET}),{abortSignal:AbortSignal.timeout(12000)});console.log('S3: bucket accessible (read-only metadata check; upload/delete permissions not tested).');client.destroy();}catch(e){failed=true;console.log(`S3: failed (${e.name}, HTTP ${e.$metadata?.httpStatusCode||'unknown'}); inspect region, bucket and IAM permissions locally.`);}
process.exitCode=failed?1:0;
