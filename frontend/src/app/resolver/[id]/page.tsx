import StaffPage from '@/components/staff-page';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <StaffPage kind="resolver" section={id==='notifications'?'notifications':'disputes'} caseId={id==='notifications'?undefined:id}/>;}
