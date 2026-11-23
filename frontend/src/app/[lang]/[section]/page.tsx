import NotificationsScreen from '@/components/notifications-screen';
import {notFound,redirect} from 'next/navigation';
import Workspace from '@/components/workspaces';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{section:string}>}){const {section}=await params;if(section==='admin')redirect('/admin');if(section==='notifications')return <NotificationsScreen/>;if(!['delivery','my-trips','my-shop','profile'].includes(section))notFound();return <Workspace section={section}/>;}
