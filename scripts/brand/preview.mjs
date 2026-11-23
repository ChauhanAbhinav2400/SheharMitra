import sharp from 'sharp';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const kinds=['tractor-parts','household','stationery','clothing','food','hardware','electricals','utensils'];
const thumbs=await Promise.all(kinds.map(kind=>sharp(path.join(root,'frontend/public/shops',`${kind}.svg`)).resize(400,300).png().toBuffer()));
await sharp({create:{width:1600,height:600,channels:4,background:'#FFF8EC'}}).composite(thumbs.map((input,i)=>({input,left:(i%4)*400,top:Math.floor(i/4)*300}))).png().toFile(path.join(root,'frontend/public/brand/storefront-proof.png'));
await sharp(path.join(root,'frontend/public/illustrations/town-road.svg')).png().toFile(path.join(root,'frontend/public/brand/hero-proof.png'));
