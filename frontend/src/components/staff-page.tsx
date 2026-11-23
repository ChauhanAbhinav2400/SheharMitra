import {cookies} from 'next/headers';
import {AppProvider} from './provider';
import StaffScreen from './staff-screen';
export default async function StaffPage({kind,section,caseId}:{kind:'admin'|'resolver';section?:string;caseId?:string}){const lang=(await cookies()).get('sheharmitra-language')?.value==='en'?'en':'hi';return <AppProvider lang={lang}><StaffScreen kind={kind} section={section} caseId={caseId}/></AppProvider>;}
