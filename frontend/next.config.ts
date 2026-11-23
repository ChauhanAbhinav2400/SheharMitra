import type { NextConfig } from 'next';
const imageOrigins = (process.env.NEXT_PUBLIC_IMAGE_ORIGINS || '').split(',').filter(Boolean);
const config: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  images: { remotePatterns: [...imageOrigins.map(origin => { const u = new URL(origin); return { protocol: u.protocol.replace(':','') as 'https'|'http', hostname:u.hostname, port:u.port, pathname:'/**' }; }), ...(() => {const u=new URL(process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000/api');return [{protocol:u.protocol.replace(':','') as 'https'|'http',hostname:u.hostname,port:u.port,pathname:'/api/uploads/public/**'}];})()] },
  async headers() { return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(self), microphone=(self), geolocation=(self)'}]}]; }
};
export default config;
