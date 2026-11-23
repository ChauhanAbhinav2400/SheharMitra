import OrderDetail from '@/components/order-detail';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){return <OrderDetail id={(await params).id}/>;}
