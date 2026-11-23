import type {MetadataRoute} from 'next';
import {publicApi,siteOrigin} from '@/lib/api';
import {Shop} from '@/lib/types';
import {categories} from '@/i18n';
export const dynamic='force-dynamic';
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const shops:Shop[]=[];for(let page=1;page<=100;page++){const result=await publicApi<{shops:Shop[];pages:number}>(`/shops?limit=24&page=${page}`);if(!result)break;shops.push(...result.shops);if(page>=result.pages)break;}const routes=['','/towns/najibabad',...categories.map(c=>`/categories/${c}`),...shops.map(s=>`/shops/${s.slug}`)];return routes.flatMap(path=>['hi','en'].map(lang=>({url:`${siteOrigin()}/${lang}${path}`,alternates:{languages:{'hi-IN':`${siteOrigin()}/hi${path}`,'en-IN':`${siteOrigin()}/en${path}`}}})));}
