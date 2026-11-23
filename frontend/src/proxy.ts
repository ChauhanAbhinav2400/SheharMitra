import {NextRequest,NextResponse} from 'next/server';
export function proxy(request:NextRequest) {const headers=new Headers(request.headers);headers.set('x-sheharmitra-lang',request.nextUrl.pathname.startsWith('/en')?'en':'hi');return NextResponse.next({request:{headers}});}
export const config={matcher:['/((?!_next|brand|shops|illustrations|favicon).*)']};
