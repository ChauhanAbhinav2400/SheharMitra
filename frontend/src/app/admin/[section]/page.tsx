import {notFound} from 'next/navigation';
import StaffPage from '@/components/staff-page';
export default async function Page({params}:{params:Promise<{section:string}>}){const {section}=await params;if(!['users','approvals','shops','orders','trips','disputes','audit','notifications'].includes(section))notFound();return <StaffPage kind="admin" section={section}/>;}
