export function roleHome(roles:string[],lang='en'){return roles.includes('admin')?'/admin':roles.some(r=>['resolver','dispute_resolver'].includes(r))?'/resolver':`/${lang}/profile`;}
export const staffRole=(roles:string[])=>roles.some(r=>['admin','resolver','dispute_resolver'].includes(r));
