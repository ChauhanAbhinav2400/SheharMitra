import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {parse} from 'dotenv';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
const e=parse(readFileSync(new URL('../backend/.env',import.meta.url)));
const client=new S3Client({region:e.S3_REGION,...(e.S3_ENDPOINT?{endpoint:e.S3_ENDPOINT,forcePathStyle:true}:{}),...(e.AWS_ACCESS_KEY_ID&&e.AWS_SECRET_ACCESS_KEY?{credentials:{accessKeyId:e.AWS_ACCESS_KEY_ID,secretAccessKey:e.AWS_SECRET_ACCESS_KEY}}:{})});
const Key=`private/connectivity-probe-${randomUUID()}.txt`,Bucket=e.S3_BUCKET;let created=false;
try{await client.send(new PutObjectCommand({Bucket,Key,Body:'SheharMitra synthetic connectivity test. No personal information.',ContentType:'text/plain'}));created=true;const r=await client.send(new GetObjectCommand({Bucket,Key}));if(!(await r.Body.transformToString()).includes('synthetic'))throw Error('Mismatch');console.log('S3 object write/read: passed.');}catch(error){console.log(`S3 object check failed (${error.name}, HTTP ${error.$metadata?.httpStatusCode||'unknown'}).`);process.exitCode=1;}finally{if(created){try{await client.send(new DeleteObjectCommand({Bucket,Key}));console.log('S3 test object cleanup: passed.');}catch{console.log('Cleanup failed. Remove the connectivity-probe object from the private prefix in your bucket.');process.exitCode=1;}}client.destroy();}
