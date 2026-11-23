import type {MetadataRoute} from 'next';
import {brand} from '@/config/brand';
export default function manifest():MetadataRoute.Manifest{return {name:brand.names.hi,short_name:brand.names.hi,description:brand.taglines.hi,start_url:'/hi',display:'standalone',lang:'hi',theme_color:brand.colors.primary,background_color:brand.colors.background,icons:[{src:'/brand/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/brand/icon-512.png',sizes:'512x512',type:'image/png'},{src:'/brand/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]};}
