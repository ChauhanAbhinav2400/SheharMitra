Live-service setup (Firebase phone OTP, Cloudflare TURN, MongoDB/S3, and pre-payment acceptance): [LIVE-SETUP.md](LIVE-SETUP.md).

## Deploy to Northflank and Vercel

Keep both workspaces in this repository. Environment files, local databases, uploaded files, and generated builds are excluded from Git. Copy values privately into each host's environment settings; do not commit credentials. Payments remain simulated after deployment.

**Northflank backend:** create a combined service linked to this repository, using `Dockerfile.backend` with repository root `/` as the build context. The image supplies its start command. Expose HTTP port `4000` publicly, use `/health` for liveness and `/ready` for readiness, and keep one running instance because call/presence state is process-local. The runtime image contains only backend production dependencies and compiled code, and runs as a non-root user.

Set these runtime variables, replacing both example origins with your assigned HTTPS addresses:

```dotenv
NODE_ENV=production
PORT=4000
API_ORIGIN=https://YOUR-BACKEND.code.run
FRONTEND_ORIGINS=https://YOUR-FRONTEND.vercel.app
TRUST_PROXY_HOPS=1
COOKIE_SAME_SITE=none
DATABASE_ADAPTER=mongo
STORAGE_ADAPTER=s3
OTP_PROVIDER=firebase
TURN_PROVIDER=cloudflare
DEMO_SEED=false
GEOCODING_PROVIDER=geoapify
```

Also supply `SESSION_SECRET` (at least 32 random characters), `MONGODB_URI`, `S3_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`, and `GEOAPIFY_API_KEY`. Use the existing database and bucket; do not seed the hosted database. Configure Atlas network access for the backend's outbound connections. Firebase private keys support literal `\n` escapes. See [the example environment](../backend/.env.example) for optional settings.

**Vercel frontend:** import the same repository, select the Next.js preset, root directory `frontend`, Node.js `22.x`, install command `cd .. && npm ci`, and build command `npm run build`. Leave the output directory at the framework default. Enable **Include source files outside of the Root Directory in the Build Step**, because the frontend imports shared backend source. Avoid skipping deployments based only on frontend changes: shared backend source can affect the frontend build.

Set these Production environment variables before building:

```dotenv
NEXT_PUBLIC_SITE_ORIGIN=https://YOUR-FRONTEND.vercel.app
NEXT_PUBLIC_API_URL=https://YOUR-BACKEND.code.run/api
API_INTERNAL_URL=https://YOUR-BACKEND.code.run/api
NEXT_PUBLIC_SOCKET_URL=https://YOUR-BACKEND.code.run
NEXT_PUBLIC_AUTH_PROVIDER=firebase
NEXT_PUBLIC_DEMO_MODE=false
```

Copy the `NEXT_PUBLIC_FIREBASE_*` web configuration and VAPID key from your local frontend environment. Backend credentials must never be added to `NEXT_PUBLIC_*` variables. Setting `NEXT_PUBLIC_DEMO_MODE=false` hides the synthetic-data banner; it does not enable real payments. Redeploy after changing public environment variables.

After both addresses are assigned, update the origins on both hosts and add the frontend hostname to Firebase Authentication's Authorized domains. Keep the Firebase web config's existing auth domain. API URLs end in `/api`; the socket URL and origin variables do not.

Separate `vercel.app` and `code.run` domains require `COOKIE_SAME_SITE=none`, but browsers blocking third-party cookies may still block login and socket authentication. For reliable cross-browser sessions, attach HTTPS subdomains of the same owned domain (for example `app.example.com` and `api.example.com`), update all origins, and use `COOKIE_SAME_SITE=lax`.

Verify `/health` and `/ready`, then test login/logout, shop images, chat, immediate call-back, calls across mobile data and Wi-Fi, trip matching, order completion, and staff permissions on the hosted URLs. Keep the payment flow labelled as simulated.

References: [Northflank deployment](https://northflank.com/docs/v1/application/getting-started/build-and-deploy-your-code), [Vercel monorepos](https://vercel.com/docs/monorepos/monorepo-faq).

