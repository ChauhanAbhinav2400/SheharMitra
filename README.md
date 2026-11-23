Live-service setup (Firebase phone OTP, Cloudflare TURN, MongoDB/S3, and pre-payment acceptance): [LIVE-SETUP.md](docs/LIVE-SETUP.md).

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

Also supply `SESSION_SECRET` (at least 32 random characters), `MONGODB_URI`, `S3_REGION`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`, and `GEOAPIFY_API_KEY`. Use the existing database and bucket; do not seed the hosted database. Configure Atlas network access for the backend's outbound connections. Firebase private keys support literal `\n` escapes. See [the example environment](backend/.env.example) for optional settings.

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

# शहर मित्र · SheharMitra

**शहर की दुकान, अब आपके गाँव।**  
Town shops, now accessible from your village.

A mobile-first, Hindi/English town-to-village parcel-commerce pilot for Najibabad. Buyers discover familiar shops, discuss their needs, accept a versioned quote, negotiate delivery with an approved traveller, and verify pickup/delivery. One account can buy, run a shop and work as a delivery partner. The interface uses the owner's language-specific logos and original synthetic storefront illustrations.

The frontend is **Next.js App Router + React + TypeScript + Tailwind**. A separate **Express + TypeScript + Socket.IO** backend owns authentication, persistence, commerce rules, messaging and WebRTC signaling. MongoDB/Mongoose is the production persistence adapter; an explicit durable local JSON adapter runs the credential-free demo. **All payment events are DEMO ledger entries; no real money is collected.** No deployment or paid resource has been created.

## Run locally

Use Node 22+, then run from this folder:

```sh
npm ci
npm run brand
npm run seed
npm run dev
```

Local environment files are already provided with safe defaults and empty credential fields. If starting from a fresh checkout where they are absent, copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local`, preserving any existing values. Open [Hindi marketplace](http://localhost:3000/hi) or [English marketplace](http://localhost:3000/en). Windows/VS Code, Mongo replica-set setup and owner deployment instructions are in [SETUP.md](docs/SETUP.md).

`npm run seed` **replaces the selected development database** with synthetic demo records; stop the API first and use a disposable database. It refreshes upcoming trip and quote times. The seed is disabled in production. Do not run it against data you want to preserve.

| Demo account | Phone | Password |
| --- | --- | --- |
| Buyer / Seema | `9000000001` | `DemoPass123!` |
| Seller / Amit | `9000000002` | `DemoPass123!` |
| Approved delivery partner / Ravi | `9000000003` | `DemoPass123!` |
| Admin reviewer | `9000000004` | `DemoPass123!` |
| Assigned dispute resolver | `9000000005` | `DemoPass123!` |
| Pending delivery partner | `9000000006` | `DemoPass123!` |
| Unrelated buyer / Anita | `9000000007` | `DemoPass123!` |
| Replacement partner / Mohan | `9000000008` | `DemoPass123!` |

Set `DEMO_PASSWORD` before reseeding to choose another local password. Use different browser profiles for independent identities; one account's workspace switcher changes capabilities without signing out. Follow the [three-minute walkthrough](docs/WALKTHROUGH.md) for the ordinary delivery and food-cancellation cases.

## Implemented scope

- Public bilingual shop discovery with town/category filters, alias-aware server search, pagination, approved shop detail pages and synthetic storefront recognition cues.
- Secure password sessions, CSRF and origin checks, pluggable phone OTP, seller onboarding, manually reviewed delivery-partner identity, and private authorized image access through local/S3 storage adapters.
- Structured quote versions and explicit acceptance, buyer-owned delivery-fee negotiation, ordered-route/time matching with space agreed by call or chat, atomic reservations and a separate idempotent demo payment ledger.
- Actor-checked preparation and custody transitions, distinct protected handover codes, cancellations/rematching, incident records, assigned dispute review and component-aware partial settlement.
- Persistent private conversations, unread state and reconnectable Socket.IO notifications. Genuine WebRTC signaling and media controls are gated on owner-configured TURN; missing configuration offers chat.
- Hindi/English resources, light-only warm theme, large text and help controls, public SEO metadata and PWA assets. User-written messages are never silently translated.

The owner-supplied `english logo.png` and `hindi logo.png` remain unchanged. Both final wordmarks use the English master icon; original Hindi lettering is preserved. [Brand notes and reproducible processing](docs/brand.md) explain the generated files and PNG-versus-SVG choice.

## Integrations and limits

The local demo needs no external credentials. For hosted operation, the owner supplies MongoDB, S3-compatible storage, secure origins/session secret, a real SMS webhook or disabled registration, and TURN for cross-network calls. [ENVIRONMENT.md](docs/ENVIRONMENT.md) lists every used variable, its source, required status and build/runtime behavior. Never place privileged credentials in `NEXT_PUBLIC_` values.

The payment interface currently has only the DEMO provider. Real payments, cash-on-delivery, blockchain/testnet escrow, passenger bookings, vehicle hire, multi-leg relays and multi-shop carts are not enabled. Route proximity is a labelled geometric estimate from illustrative seed coordinates, not a verified road journey or a delivery guarantee. No external routing/map service is enabled. Medicines, hazardous goods and temperature-controlled deliveries are outside the pilot categories.

The local adapter is for one backend process. The Mongo pilot uses transactions and indexed shop search, but general unit-of-work snapshots are bounded to 10,000 rows per collection; targeted repositories are needed before scaling further. Call busy state is currently atomic within one signaling process; distributed calling requires a shared busy registry and Socket.IO adapter. A sleeping backend interrupts persistent connections. These are documented pilot limits, not production certification claims.

## Structure and checks

```text
frontend/             Next.js public pages, authenticated controls, i18n and theme
backend/src/domain/   Commerce transitions, matching, codes, payment ledger
backend/src/data/     Mongo/local adapters and synthetic seed
backend/src/          Express auth, uploads, verification, chat, signaling, operations
backend/tests/        Commerce and HTTP security regression coverage
scripts/brand/        Repeatable source-logo and vector asset generation
docs/                 Setup, environment, walkthrough and implementation notes
docker-compose.yml    Optional loopback-only local Mongo replica set
```

```sh
npm run typecheck
npm test
npm run build
```

Automated coverage includes search aliases, trip direction/time and partner-agreed space, permissions, concurrent reservations, payment retries, quote invalidation, preparation gates, handover codes, cancellation/rematching and partial settlement. The Mongo smoke test is skipped unless `MONGO_TEST_URI` is set to a disposable replica-set database. Live TURN/SMS/S3 checks require owner configuration. Final build, test and browser verification results are recorded during handoff; these commands alone are not a claim that external services have been tested.

Further detail: [setup](docs/SETUP.md), [environment](docs/ENVIRONMENT.md), [walkthrough](docs/WALKTHROUGH.md), [backend security and operations](docs/backend.md), [commerce rules](docs/commerce.md), [brand assets](docs/brand.md).

Current verification and remaining pilot limits: [implementation checklist](docs/IMPLEMENTATION-CHECKLIST.md).
