import {Home} from '@/components/home';
import {publicApi} from '@/lib/api';
import {publicMetadata} from '@/lib/seo';
import {Lang} from '@/i18n';
import {brand} from '@/config/brand';
export const dynamic='force-dynamic';
export async function generateMetadata({params,searchParams}:{params:Promise<{lang:Lang}>;searchParams:Promise<Record<string,string>>}){const {lang}=await params;const query=await searchParams;return {...publicMetadata(lang,'',`${brand.names[lang]}: ${brand.taglines[lang]}`,brand.taglines[lang]),...(Object.keys(query).length?{robots:{index:false,follow:true}}:{})};}
export default async function Page({params}:{params:Promise<{lang:Lang}>}){const {lang}=await params;return <Home lang={lang} initial={await publicApi('/shops?limit=6')}/>;}
