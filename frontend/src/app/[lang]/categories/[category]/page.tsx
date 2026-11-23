import {Home} from '@/components/home';
import {publicApi} from '@/lib/api';
import {publicMetadata} from '@/lib/seo';
import {Lang,translate,categories} from '@/i18n';
import {brand} from '@/config/brand';
import {notFound} from 'next/navigation';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{lang:Lang;category:string}>}){const {lang,category}=await params;return publicMetadata(lang,`/categories/${category}`,`${translate(lang,category)} | ${brand.names[lang]}`,translate(lang,'search_note'));}
export default async function Page({params}:{params:Promise<{lang:Lang;category:string}>}){const {lang,category}=await params;if(!categories.includes(category))notFound();return <Home lang={lang} category={category} initial={await publicApi(`/shops?category=${category}&limit=6`)}/>;}
