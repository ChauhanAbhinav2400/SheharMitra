import type {Metadata} from 'next';
import {siteOrigin} from './api';
import {brand} from '@/config/brand';
import type {Lang} from '@/i18n';
export function publicMetadata(lang:Lang,path:string,title:string,description:string):Metadata {const origin=siteOrigin();return {metadataBase:new URL(origin),title,description,alternates:{canonical:`/${lang}${path}`,languages:{'hi-IN':`/hi${path}`,'en-IN':`/en${path}`}},openGraph:{title,description,url:`/${lang}${path}`,siteName:brand.names[lang],locale:lang==='hi'?'hi_IN':'en_IN',alternateLocale:lang==='hi'?'en_IN':'hi_IN',images:[{url:`/brand/og-${lang}.png`,width:1200,height:630}]}};}
