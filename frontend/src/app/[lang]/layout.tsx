import {notFound} from 'next/navigation';
import {AppProvider} from '@/components/provider';
import {Shell} from '@/components/shell';
import {isLang} from '@/i18n';
export default async function Layout({children,params}:{children:React.ReactNode;params:Promise<{lang:string}>}){const {lang}=await params;if(!isLang(lang))notFound();return <AppProvider lang={lang}><Shell>{children}</Shell></AppProvider>;}
