/** Reproducible code-native illustrations and brand derivatives.
 * Run from any directory: node scripts/brand/generate.mjs
 * Owner PNG sources, if present, are read only. Use optional source-crops.json
 * to set exact icon/text crops after inspecting the real artwork. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pub = path.join(root, 'frontend/public');
const brandDir = path.join(pub, 'brand');
for (const folder of [brandDir, path.join(brandDir, 'source'), path.join(pub, 'shops'), path.join(pub, 'illustrations')]) await fs.mkdir(folder, { recursive: true });
const ink = '#2B2118', green = '#1F6B4F', cream = '#FFF8EC', gold = '#F4A300';
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const svg = (w,h,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const text = (x,y,value,size=28,color=ink,extra='') => `<text x="${x}" y="${y}" fill="${color}" font-family="Nirmala UI,Noto Sans Devanagari,Mukta,Arial,sans-serif" font-size="${size}" ${extra}>${esc(value)}</text>`;
const simpleBody = `<rect width="64" height="64" rx="14" fill="${green}"/><path d="M10 22h44l-3-10H13z" fill="${cream}"/><path d="M10 22c0 4 3.5 6 6.3 6S22.7 26 22.7 22c0 4 3.5 6 6.3 6s6.3-2 6.3-6c0 4 3.5 6 6.3 6s6.3-2 6.3-6" fill="${gold}"/><rect x="14" y="30" width="36" height="20" rx="2" fill="${cream}"/><rect x="27" y="36" width="10" height="14" rx="1.5" fill="${green}"/><path d="M8 56c14-6 30-6 48 0" stroke="${gold}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
const simple = svg(64,64,simpleBody);
await fs.writeFile(path.join(brandDir,'logo-icon-simple.svg'), simple);

const shopSpecs = [
  ['tractor-parts','किसान ट्रैक्टर पार्ट्स','ट्रैक्टर के छोटे पुर्ज़े','#F1CA8D','#385F4B'],
  ['household','अपना किराना','रोज़मर्रा का सामान','#F3D7A9','#B35C3A'],
  ['stationery','विद्या स्टेशनरी','किताबें और कॉपियाँ','#CADDC8','#54756F'],
  ['clothing','रंगोली वस्त्र','कपड़े और सिलाई','#EDC8BD','#7F514D'],
  ['food','मधुर मिठाई भंडार','ताज़ा मिठाई और नमकीन','#F1D4A0','#B46F2E'],
  ['hardware','विश्वास हार्डवेयर','घर की छोटी मरम्मत','#D6D4BF','#5F7565'],
  ['electricals','रोशनी इलेक्ट्रिकल्स','बल्ब और बिजली का सामान','#E9D8AC','#506D73'],
  ['utensils','गृहलक्ष्मी बर्तन','रसोई के लिए बर्तन','#D5DCCD','#8A674D'],
];
function wheel(x,y,r=32) { return `<circle cx="${x}" cy="${y}" r="${r}" fill="#343A32"/><circle cx="${x}" cy="${y}" r="${r*.68}" fill="#A5A596"/><circle cx="${x}" cy="${y}" r="${r*.25}" fill="#525B4D"/><circle cx="${x}" cy="${y}" r="${r*.86}" fill="none" stroke="#6B7063" stroke-width="4" stroke-dasharray="8 7"/>`; }
function goods(kind) {
  if(kind==='tractor-parts') return `<g>${wheel(192,431,44)}${wheel(225,448,30)}${wheel(484,344,19)}${wheel(536,344,19)}${wheel(588,344,19)}<rect x="456" y="393" width="153" height="56" rx="4" fill="#C39B59"/><path d="M465 412h136m-103-15v49m67-49v49" stroke="#806542" stroke-width="4"/><rect x="295" y="359" width="88" height="68" rx="6" fill="#7E8D75"/><path d="M308 345h16v21h-16zm31 2h16v21h-16z" fill="#ABB39E"/><rect x="300" y="393" width="80" height="11" fill="#D0D0B7"/></g>`;
  if(kind==='household') return `<g><path d="M143 372q40-18 79 0l9 77h-98z" fill="#D9B773"/><path d="M148 376q30 10 68 0" stroke="#9C7D45" stroke-width="4"/>${text(159,421,'दाल',22,'#705532')}<path d="M234 392q35-20 71 0l8 57h-89z" fill="#E6C994"/>${text(244,431,'चावल',18,'#705532')}<rect x="480" y="334" width="32" height="42" rx="5" fill="#D49B46"/><rect x="527" y="334" width="32" height="42" rx="5" fill="#A8B779"/><rect x="574" y="334" width="32" height="42" rx="5" fill="#C57654"/><g fill="#AFA565"><rect x="478" y="398" width="125" height="45" rx="3"/></g><path d="M478 415h125m-98-17v46m35-46v46m35-46v46" stroke="#736D49" stroke-width="3"/><g fill="#BA6F36"><circle cx="493" cy="397" r="10"/><circle cx="516" cy="395" r="10"/><circle cx="540" cy="398" r="10"/><circle cx="565" cy="396" r="10"/><circle cx="589" cy="397" r="10"/></g></g>`;
  if(kind==='stationery') return `<g><rect x="153" y="396" width="121" height="15" fill="#7F9B70"/><rect x="160" y="380" width="114" height="16" fill="#DFAF54"/><rect x="150" y="364" width="120" height="16" fill="#BA7461"/><rect x="164" y="347" width="102" height="17" fill="#F4DEAD"/><path d="M162 352h83m-92 18h97m-80 18h83m-81 15h88" stroke="#FFF8EC" stroke-width="3"/><rect x="499" y="319" width="30" height="63" rx="2" fill="#CD8B4D"/><rect x="534" y="309" width="27" height="73" rx="2" fill="#9CBA8A"/><rect x="567" y="323" width="29" height="59" rx="2" fill="#BB7C61"/><rect x="505" y="336" width="18" height="22" fill="#FBEACD"/><rect x="540" y="333" width="15" height="29" fill="#FBEACD"/><rect x="571" y="339" width="20" height="21" fill="#FBEACD"/><path d="M342 370l-7-47m18 47 3-50m7 50 13-43" stroke="#E4B347" stroke-width="7"/><path d="M328 359h45l-5 43h-35z" fill="#BD8060"/></g>`;
  if(kind==='clothing') return `<g><path d="M162 313h112v8H162z" fill="#5F5146"/><path d="M184 319l-20 31 17 10 6-15v63h46v-63l8 15 17-10-22-31-14 11h-23z" fill="#C77E68"/><path d="M190 320l17 28 17-28m-17 28v61" fill="none" stroke="#E7B990" stroke-width="4"/><path d="M495 324h108" stroke="#5F5146" stroke-width="6"/><path d="M510 326h30v73h-30z" fill="#D6AD52"/><path d="M545 326h23v73h-23z" fill="#7F9A82"/><path d="M574 326h23v73h-23z" fill="#C68D81"/><path d="M510 385h30m5-9h23m6 9h23" stroke="#F9EACD" stroke-width="7"/><rect x="480" y="417" width="127" height="13" rx="2" fill="#9F7D83"/><rect x="484" y="404" width="118" height="13" rx="2" fill="#DCC27E"/></g>`;
  if(kind==='food') return `<g><rect x="142" y="353" width="136" height="86" rx="5" fill="#B79D73"/><rect x="150" y="360" width="120" height="52" fill="#E9E2C7" opacity=".8"/><path d="M150 385h120m-62-25v52" stroke="#AA946A" stroke-width="4"/><g fill="#DEAB49"><circle cx="161" cy="378" r="8"/><circle cx="179" cy="378" r="8"/><circle cx="198" cy="378" r="8"/><circle cx="217" cy="402" r="8"/><circle cx="237" cy="402" r="8"/><circle cx="256" cy="402" r="8"/></g><g fill="#F6ECCF"><rect x="215" y="369" width="16" height="10" rx="2"/><rect x="237" y="369" width="17" height="10" rx="2"/><rect x="157" y="396" width="17" height="10" rx="2"/><rect x="182" y="396" width="17" height="10" rx="2"/></g><path d="M484 415h124l-10 20H494z" fill="#A28153"/><g fill="#D18F37"><circle cx="502" cy="407" r="13"/><circle cx="528" cy="407" r="13"/><circle cx="554" cy="407" r="13"/><circle cx="580" cy="407" r="13"/><circle cx="516" cy="385" r="13"/><circle cx="542" cy="385" r="13"/><circle cx="567" cy="385" r="13"/><circle cx="529" cy="364" r="13"/><circle cx="554" cy="364" r="13"/></g></g>`;
  if(kind==='hardware') return `<g><path d="M166 331h103v94H166z" fill="#D5B880"/><path d="M182 347v52m25-52v52m25-52v52m22-52v52" stroke="#E2C894" stroke-width="3"/><path d="M181 347h29v13h-29z" fill="#596354"/><path d="M193 360v44" stroke="#956949" stroke-width="7"/><path d="M231 342v61" stroke="#69705F" stroke-width="8"/><path d="M225 345l6-8 6 8" fill="none" stroke="#69705F" stroke-width="6"/><rect x="484" y="393" width="50" height="48" rx="4" fill="#B8724D"/><rect x="545" y="393" width="50" height="48" rx="4" fill="#86A29A"/><path d="M484 400h50m11 0h50" stroke="#EBDFBF" stroke-width="9"/><path d="M493 392c0-22 32-22 32 0m29 0c0-22 32-22 32 0" fill="none" stroke="#5E6659" stroke-width="3"/><path d="M320 318v116m19-116v116m19-116v116" stroke="#8F9B87" stroke-width="7"/></g>`;
  if(kind==='electricals') return `<g><path d="M181 312v28m52-28v28m276-28v28m58-28v28" stroke="#7C704F" stroke-width="3"/><g fill="#F7E0A6" stroke="#B4A17A" stroke-width="2"><path d="M181 337c-26 0-27 34-8 45v11h17v-11c19-11 18-45-9-45z"/><path d="M233 337c-26 0-27 34-8 45v11h17v-11c19-11 18-45-9-45z"/><path d="M509 337c-26 0-27 34-8 45v11h17v-11c19-11 18-45-9-45z"/><path d="M567 337c-26 0-27 34-8 45v11h17v-11c19-11 18-45-9-45z"/></g><g fill="#7B8171"><rect x="171" y="392" width="21" height="8" rx="2"/><rect x="223" y="392" width="21" height="8" rx="2"/><rect x="499" y="392" width="21" height="8" rx="2"/><rect x="557" y="392" width="21" height="8" rx="2"/></g><circle cx="349" cy="392" r="30" fill="none" stroke="#A26B46" stroke-width="17"/><circle cx="349" cy="392" r="28" fill="none" stroke="#C18F58" stroke-width="3"/><rect x="479" y="418" width="124" height="27" fill="#91A79A"/><path d="M496 426h90m-90 11h90" stroke="#DCE3D1" stroke-width="4"/></g>`;
  return `<g><path d="M145 381h127l-13 49h-101z" fill="#A3ADA6"/><ellipse cx="208" cy="381" rx="64" ry="11" fill="#D5DBD1"/><path d="M161 395h95" stroke="#CAD0C5" stroke-width="3"/><path d="M165 362h84l-9 17h-66z" fill="#BDC6BC"/><ellipse cx="207" cy="361" rx="42" ry="8" fill="#E0E3D8"/><path d="M501 379h85l-8 53h-69z" fill="#B48655"/><ellipse cx="543" cy="378" rx="43" ry="10" fill="#CFAA75"/><path d="M516 370c-16-40 70-40 54 0" fill="none" stroke="#986B43" stroke-width="5"/><path d="M500 392h-13v23h19m80-23h13v23h-20" fill="none" stroke="#986B43" stroke-width="6"/><circle cx="355" cy="355" r="30" fill="#C7D0C3"/><circle cx="355" cy="355" r="23" fill="none" stroke="#8D9B89" stroke-width="2"/><path d="M355 384v50" stroke="#8D9B89" stroke-width="9"/></g>`;
}
for(const [kind,name,subtitle,wall,accent] of shopSpecs) {
  const inner = `<defs><pattern id="shutter" width="8" height="12" patternUnits="userSpaceOnUse"><path d="M0 1h8" stroke="#7D8975" stroke-opacity=".35" stroke-width="2"/></pattern></defs><rect width="800" height="600" fill="#F7EEDD"/><path d="M0 435Q350 402 800 436V600H0z" fill="#E8DCC4"/><path d="M0 510Q350 477 800 510" fill="none" stroke="#DACBB0" stroke-width="3"/><circle cx="700" cy="98" r="42" fill="#F3D795"/><path d="M0 150L75 104l74 46v278H0zm656-14 78-42 66 42v292H656z" fill="#E9DEC8"/><path d="M30 190h25v40H30zm57-1h25v41H87zm603-19h28v44h-28zm48 0h28v44h-28z" fill="#D8CBAF"/><path d="M39 101q234 78 692-11" stroke="#AAA28B" stroke-width="2" fill="none"/><ellipse cx="400" cy="474" rx="304" ry="27" fill="#CDBD9F" opacity=".4"/><rect x="99" y="155" width="602" height="301" rx="4" fill="${wall}"/><rect x="87" y="142" width="626" height="24" rx="3" fill="${accent}"/><rect x="119" y="173" width="562" height="88" rx="4" fill="${accent}"/>${text(400,218,name,37,cream,'text-anchor="middle" font-weight="700"')}${text(400,246,subtitle,19,cream,'text-anchor="middle"')}<rect x="132" y="284" width="536" height="164" fill="#475C4B"/><rect x="142" y="295" width="130" height="150" fill="#88927A"/><rect x="142" y="295" width="130" height="150" fill="url(#shutter)"/><rect x="287" y="295" width="147" height="150" fill="#30483D"/><rect x="449" y="295" width="208" height="150" fill="#6D7D65"/><path d="M449 384h208m-208 61h208" stroke="#BAA27A" stroke-width="7"/><path d="M116 261h568l18 37H98z" fill="${cream}"/>${Array.from({length:10},(_,i)=>`<path d="M${116+i*56.8} 261h28.4l${i>4?10:-10} 37h-30z" fill="${accent}"/>`).join('')}<path d="M98 298h604v8q-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0-15 16-30 0z" fill="${accent}"/>${goods(kind)}<rect x="98" y="446" width="604" height="15" rx="3" fill="#BBA47B"/><rect x="85" y="461" width="630" height="12" rx="3" fill="#D2BC94"/><path d="M637 429h37l-7 30h-23z" fill="#A6724D"/><path d="M654 431v-46m0 24q-34-8-25-28 26 4 25 28m0-8q28-6 21-28-25 6-21 28" fill="#6A8555"/><path d="M60 438h23l-3 25H63z" fill="#BA8453"/><path d="M72 439v-33m0 16q-23-7-17-22 19 2 17 22m0-7q18-6 16-20-18 3-16 20" fill="#7B945C"/>${text(400,551,'काल्पनिक डेमो दुकान · Illustrated demo shop',16,'#786B56','text-anchor="middle"')}`;
  await fs.writeFile(path.join(pub,'shops',`${kind}.svg`),svg(800,600,inner));
}

const tree=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0v92" stroke="#8B6947" stroke-width="12"/><path d="M0 43l-23-22m23 6L25 2" stroke="#8B6947" stroke-width="7"/><circle cx="-25" cy="-10" r="36" fill="#8EAC73"/><circle cx="25" cy="-18" r="39" fill="#6E9461"/><circle cx="-2" cy="-42" r="40" fill="#84A669"/></g>`;
const hero=`<rect width="1200" height="700" fill="#EAF0DE"/><circle cx="1025" cy="130" r="59" fill="#F3CF75"/><path d="M0 325Q170 205 350 309T700 286T1200 298V700H0z" fill="#CCDDB6"/><path d="M0 423Q230 301 520 414T1200 372V700H0z" fill="#BCD0A2"/><path d="M0 610Q315 452 602 536T1200 518V700H0z" fill="#D8DDB6"/><path d="M-70 587Q220 401 558 469T1260 352" fill="none" stroke="#F9EBCD" stroke-width="105"/><path d="M-70 587Q220 401 558 469T1260 352" fill="none" stroke="#C6BDA0" stroke-width="3" stroke-dasharray="17 22"/><g transform="translate(73 211)"><rect x="0" y="42" width="254" height="170" rx="4" fill="#E6BC7D"/><rect x="-9" y="20" width="272" height="53" rx="5" fill="${green}"/>${text(127,58,'शहर की दुकान',25,cream,'text-anchor="middle" font-weight="700"')}<rect x="19" y="107" width="84" height="105" fill="#6D876D"/><rect x="114" y="107" width="118" height="105" fill="#AD8253"/><rect x="121" y="118" width="105" height="63" fill="#DFC393"/><path d="M0 73h254l14 38H-14z" fill="${cream}"/><path d="M20 73h28l-7 38H10zm57 0h28l-2 38H68zm56 0h28l3 38h-39zm57 0h28l9 38h-39z" fill="${gold}"/><rect x="-13" y="207" width="280" height="15" rx="4" fill="#C6A172"/><path d="M130 173h28v25h-28zm35 0h28v25h-28z" fill="#6D8B5C"/></g>${tree(369,306,.8)}${tree(1043,345,.9)}<g transform="translate(802 180)"><rect x="0" y="74" width="151" height="124" fill="#E5C698"/><path d="M-17 76L75 3l94 73z" fill="#B37750"/><path d="M-2 69L75 12l79 57" fill="none" stroke="#CA9264" stroke-width="8"/><rect x="59" y="117" width="42" height="81" fill="#7B8E65"/><rect x="17" y="104" width="25" height="37" fill="#A78E66"/><rect x="115" y="104" width="22" height="37" fill="#A78E66"/><path d="M-10 198h175" stroke="#B69C72" stroke-width="9"/></g><g transform="translate(570 450)"><ellipse cx="-6" cy="72" rx="106" ry="14" fill="#B1AE8C" opacity=".4"/>${wheel(-66,49,30)}${wheel(68,49,30)}<path d="M-66 49l39-57 31 57h-70l49-44h61l24 44M3 49l31-65" fill="none" stroke="${green}" stroke-width="11" stroke-linecap="round"/><path d="M32-16h22m-89 1h27" stroke="#354F3B" stroke-width="10" stroke-linecap="round"/><path d="M25-33h67v56H25z" fill="#D59A4A"/><path d="M53-33h13v56" fill="#F0C778"/><path d="M35-20h8m29 0h9" stroke="#A5773E" stroke-width="4"/></g><path d="M454 251q98-87 239-28" fill="none" stroke="${green}" stroke-width="3" stroke-dasharray="9 11"/><path d="M680 210l17 16-24 5" fill="none" stroke="${green}" stroke-width="4" stroke-linecap="round"/><g fill="#7C9B65"><path d="M158 602l9-27 9 27zm30-8 8-22 9 22zm815-70 9-27 9 27zm30 8 8-22 9 22z"/></g>${text(1045,664,'काल्पनिक डेमो चित्र',15,'#6B7359','text-anchor="end"')}`;
await fs.writeFile(path.join(pub,'illustrations/town-road.svg'), svg(1200,700,hero));
const emptyBodies={
 shop:`<path d="M43 93h154v109H43z" fill="#E3F1EA"/><path d="M33 84h174l-15-35H48z" fill="${cream}" stroke="${green}" stroke-width="5"/><path d="M33 84h174v12q-14 17-29 0-15 17-29 0-15 17-29 0-15 17-29 0-15 17-29 0-14 17-29 0z" fill="${gold}"/><rect x="96" y="130" width="48" height="72" rx="4" fill="${green}"/><path d="M25 204h190" stroke="${green}" stroke-width="5" stroke-linecap="round"/>`,
 parcel:`<path d="M46 92l74-40 74 40v92l-74 39-74-39z" fill="#F3D593" stroke="${green}" stroke-width="4" stroke-linejoin="round"/><path d="M46 92l74 40 74-40m-74 40v91M83 72l74 40v38l-24 13v-39L59 84" fill="none" stroke="${green}" stroke-width="4"/><path d="M58 179l36 19" stroke="#C2984E" stroke-width="5" stroke-linecap="round"/>`,
 road:`<path d="M38 207q2-51 78-76 77-25 85-88" fill="none" stroke="#E3F1EA" stroke-width="65"/><path d="M38 207q2-51 78-76 77-25 85-88" fill="none" stroke="${green}" stroke-width="3" stroke-dasharray="10 10"/><path d="M75 69c0 29-28 51-28 51S19 98 19 69a28 28 0 0156 0z" fill="${gold}"/><circle cx="47" cy="68" r="10" fill="${cream}"/>`,
};
for(const [name,body] of Object.entries(emptyBodies)) await fs.writeFile(path.join(pub,'illustrations',`empty-${name}.svg`),svg(240,240,body));

// Remove only near-white background connected to an outer edge. Interior cream
// detail never qualifies: its blue channel is 236, below the 249 threshold.
async function removeOuterWhite(input, isWordmark = false) {
 const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=info; const seen=new Uint8Array(w*h), queue=[];
 const qualifies=i=>data[i*4+3]<8||(data[i*4]>248&&data[i*4+1]>248&&data[i*4+2]>248);
 function add(i){if(!seen[i]&&qualifies(i)){seen[i]=1;queue.push(i);}}
 for(let x=0;x<w;x++){add(x);add((h-1)*w+x);} for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
 for(let q=0;q<queue.length;q++){const i=queue[q],x=i%w,y=Math.floor(i/w);if(x)add(i-1);if(x<w-1)add(i+1);if(y)add(i-w);if(y<h-1)add(i+w);data[i*4+3]=0;}
 // Remove only nearly neutral edge fringe adjacent to cleared exterior. Cream
 // remains intact; a fully general recolouring algorithm would damage artwork.
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x,p=i*4;if(seen[i])continue;const r=data[p],g=data[p+1],b=data[p+2];if(isWordmark&&Math.min(r,g,b)>235&&Math.max(r,g,b)-Math.min(r,g,b)<10){data[p+3]=0;continue;}if(Math.min(r,g,b)>235&&Math.max(r,g,b)-Math.min(r,g,b)<5&&(seen[i-1]||seen[i+1]||seen[i-w]||seen[i+w]))data[p+3]=Math.round(255*(255-Math.min(r,g,b))/20);}
 return sharp(data,{raw:{width:w,height:h,channels:4}}).trim({background:'#00000000',threshold:3}).png().toBuffer();
}
const sourceEn=path.join(brandDir,'source/logo-source-en.png'),sourceHi=path.join(brandDir,'source/logo-source-hi.png');
const exists=async p=>fs.access(p).then(()=>true).catch(()=>false);
let master=await sharp(Buffer.from(simple)).resize(1024,1024).png().toBuffer();
let sourceUsed=false, logoBuffers={};
if(await exists(sourceEn)&&await exists(sourceHi)) {
 const cropPath=path.join(root,'scripts/brand/source-crops.json');
 if(!await exists(cropPath)) throw new Error('Owner source PNGs found. Inspect them and supply scripts/brand/source-crops.json with en.icon, en.text, hi.text rectangles {left,top,width,height}. No original file has been changed.');
 const crops=JSON.parse(await fs.readFile(cropPath,'utf8'));
 const icon=await removeOuterWhite(await sharp(sourceEn).extract(crops.en.icon).png().toBuffer());
 master=await sharp(icon).resize(1024,1024,{fit:'contain',background:'#00000000'}).png().toBuffer();
 for(const lang of ['en','hi']) {
   const label=await removeOuterWhite(await sharp(lang==='en'?sourceEn:sourceHi).extract(crops[lang].text).png().toBuffer(), true);
   const symbol=await sharp(master).resize(280,280).png().toBuffer();
   const labelSized=await sharp(label).resize(710,240,{fit:'inside'}).png().toBuffer();
   const m=await sharp(labelSized).metadata();
   logoBuffers[lang]=await sharp({create:{width:1200,height:400,channels:4,background:'#00000000'}}).composite([{input:symbol,left:60,top:60},{input:labelSized,left:390,top:Math.round((400-m.height)/2)}]).png().toBuffer();
 }
 sourceUsed=true;
} else {
 // This is a fallback, never represented as the owner-supplied mark.
 for(const [lang,label] of [['en','SheharMitra'],['hi','शहर मित्र']]) {
   const fallback=svg(1200,400,`<g transform="translate(60 60) scale(4.375)">${simpleBody}</g>${text(385,251,label,lang==='hi'?112:105,green,'font-weight="700"')}`);
   logoBuffers[lang]=await sharp(Buffer.from(fallback)).png().toBuffer();
 }
}
await fs.writeFile(path.join(brandDir,'logo-icon.png'),master);
for(const lang of ['hi','en']){
 await fs.writeFile(path.join(brandDir,`logo-${lang}.png`),logoBuffers[lang]);
 await fs.writeFile(path.join(brandDir,`logo-${lang}@2x.png`),logoBuffers[lang]);
 const ogTagline=lang==='hi'?'शहर की दुकान, अब आपके गाँव।':'Town shops, now accessible from your village.';
 const ogBackground=svg(1200,630,`<rect width="1200" height="630" fill="${cream}"/><circle cx="1100" cy="40" r="200" fill="#E3F1EA"/><circle cx="80" cy="650" r="180" fill="#FFF1CC"/>${text(600,465,ogTagline,lang==='hi'?40:34,ink,'text-anchor="middle"')}${text(600,535,lang==='hi'?'अपनी दुकान खोजें · बात करें · गाँव तक मँगाएँ':'Find a town shop · Talk to the owner · Get it delivered',24,'#6B5E50','text-anchor="middle"')}`);
 const logo=await sharp(logoBuffers[lang]).resize(900,300).png().toBuffer();
 await sharp(Buffer.from(ogBackground)).composite([{input:logo,left:150,top:115}]).png().toFile(path.join(brandDir,`og-${lang}.png`));
}
for(const size of [192,512])await sharp(master).resize(size,size).png().toFile(path.join(brandDir,`icon-${size}.png`));
await sharp(master).resize(180,180).flatten({background:cream}).png().toFile(path.join(brandDir,'apple-touch-icon.png'));
const safeIcon=await sharp(master).resize(320,320).png().toBuffer();
await sharp({create:{width:512,height:512,channels:4,background:green}}).composite([{input:safeIcon,left:96,top:96}]).png().toFile(path.join(brandDir,'icon-maskable-512.png'));
// ICO with two embedded PNG frames; supported by modern browsers and Windows.
const icons=await Promise.all([16,32].map(size=>sharp(Buffer.from(simple)).resize(size,size).png().toBuffer()));
const header=Buffer.alloc(6+16*icons.length);header.writeUInt16LE(1,2);header.writeUInt16LE(icons.length,4);let offset=header.length;
icons.forEach((buffer,i)=>{const p=6+i*16;header[p]=[16,32][i];header[p+1]=[16,32][i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buffer.length,p+8);header.writeUInt32LE(offset,p+12);offset+=buffer.length;});
const ico=Buffer.concat([header,...icons]);await fs.writeFile(path.join(pub,'favicon.ico'),ico);await fs.writeFile(path.join(brandDir,'favicon.ico'),ico);
for(const [name,color] of [['cream',cream],['white','#FFFFFF'],['green',green]]) {
 const previews=await Promise.all(['hi','en'].map(lang=>sharp(logoBuffers[lang]).resize(600,200).png().toBuffer()));
 await sharp({create:{width:640,height:460,channels:4,background:color}}).composite([{input:previews[0],left:20,top:20},{input:previews[1],left:20,top:240}]).png().toFile(path.join(brandDir,`proof-${name}.png`));
}
await fs.writeFile(path.join(brandDir,'asset-report.json'),JSON.stringify({sourceUsed,sourceFiles:sourceUsed?['source/logo-source-en.png','source/logo-source-hi.png']:[],fallback:!sourceUsed,notes:sourceUsed?'Owner source crops were processed. Inspect proof files before release.':'Owner source PNG files were absent. Used the supplied simplified SVG with platform-rendered fallback text. The UI uses live Baloo 2 text. No logo trace or original-source cleanup can be verified until sources are supplied.',storefronts:shopSpecs.map(([slug,name])=>({slug,name,synthetic:true}))},null,2)+'\n');
console.log(`Generated 8 synthetic shopfronts, hero, empty states, and brand assets (${sourceUsed?'owner source':'documented fallback'}).`);
