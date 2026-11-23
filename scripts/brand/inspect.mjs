import sharp from 'sharp';
for(const f of ['english logo.png','hindi logo.png']) {
 const m=await sharp(f).metadata(); const {data,info}=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let minX=info.width,minY=info.height,maxX=0,maxY=0,opaque=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i+3]>10){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);opaque++;}}
 console.log(f,{width:m.width,height:m.height,hasAlpha:m.hasAlpha,firstPixel:Array.from(data.slice(0,4)),bounds:{minX,minY,maxX,maxY},opaque});
 await sharp(f).resize(1200).flatten({background:'#FFF8EC'}).png().toFile(f==='english logo.png'?'frontend/public/brand/source-proof-en.png':'frontend/public/brand/source-proof-hi.png');
}
