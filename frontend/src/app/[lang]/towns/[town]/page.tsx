import {Home} from '@/components/home';
import {publicApi} from '@/lib/api';
import {publicMetadata} from '@/lib/seo';
import {Lang,translate} from '@/i18n';
import {brand} from '@/config/brand';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{lang:Lang;town:string}>}){const {lang,town}=await params;return publicMetadata(lang,`/towns/${town}`,`${translate(lang,town)} · ${translate(lang,'all')} | ${brand.names[lang]}`,`${translate(lang,'shops_sub')} ${translate(lang,'search_note')}`);}
export default async function Page({params}:{params:Promise<{lang:Lang;town:string}>}){const {lang,town}=await params;if(!town.trim()||town.length>100)notFound();return <Home lang={lang} town={town} initial={await publicApi(`/shops?town=${encodeURIComponent(town)}&limit=6`)}/>;}
