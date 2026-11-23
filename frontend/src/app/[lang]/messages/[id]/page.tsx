import MessagesScreen from '@/components/messages-screen';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){return <MessagesScreen id={(await params).id}/>;}
