import {notFound} from 'next/navigation';
import {brand} from '@/config/brand';
import {AppProvider} from '@/components/provider';
import {Button,Badge,Field} from '@/components/ui';
import {BrandLogo} from '@/components/shell';
export const metadata={robots:{index:false,follow:false}};
export default function Page(){if(process.env.NODE_ENV==='production')notFound();return <main className="container section"><h1>SheharMitra · Design system</h1>{(['hi','en'] as const).map(lang=><AppProvider key={lang} lang={lang}><section className="panel section"><BrandLogo/><h2>{brand.taglines[lang]}</h2><div className="actions"><Button>{lang==='hi'?'आगे बढ़ें':'Continue'}</Button><Button variant="secondary">{lang==='hi'?'वापस जाएँ':'Go back'}</Button><Button variant="danger">{lang==='hi'?'रद्द करें':'Cancel'}</Button></div><Field label={lang==='hi'?'आपका नाम':'Your name'}/><div className="actions">{['quote_proposed','confirmed','ready','picked_up','delivered','completed','disputed'].map(status=><Badge status={status} key={status}/>)}</div></section></AppProvider>)}<div className="shop-grid section">{Object.entries(brand.colors).map(([name,color])=><div className="panel" key={name}><div style={{background:color,height:60,border:'1px solid var(--border)'}}/><p>{name} · {color}</p></div>)}</div></main>;}
