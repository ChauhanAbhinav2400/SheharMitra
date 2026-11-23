import {Lang,translate} from '@/i18n';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{lang:Lang}>}){const {lang}=await params;return <section className="container section"><h1>{translate(lang,'offline_title')}</h1><p>{translate(lang,'offline_body')}</p></section>;}
