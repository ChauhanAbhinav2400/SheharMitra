import type {Config} from 'tailwindcss';
import {brand} from './src/config/brand';
export default {content:['./src/**/*.{ts,tsx}'],theme:{extend:{colors:brand.colors,fontFamily:{sans:['var(--font-body)','Mukta','Nirmala UI','sans-serif'],heading:['var(--font-heading)','Baloo 2','sans-serif']},borderRadius:{card:'16px',button:'14px',input:'12px'},maxWidth:{content:'1120px'}}},plugins:[]} satisfies Config;
