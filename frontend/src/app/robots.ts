import type {MetadataRoute} from 'next';
import {siteOrigin} from '@/lib/api';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',allow:'/',disallow:['/*/orders','/*/messages','/*/profile','/*/admin','/*/my-shop','/*/my-trips','/*/login','/*/onboarding','/dev/','/api/']},sitemap:`${siteOrigin()}/sitemap.xml`};}
