import {redirect} from 'next/navigation';
import {cookies} from 'next/headers';
export default async function Page(){redirect((await cookies()).get('sheharmitra-language')?.value==='en'?'/en':'/hi');}
