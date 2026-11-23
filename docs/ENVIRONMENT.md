# Environment configuration

Keep local values in gitignored `frontend/.env.local` and `backend/.env`; examples contain only safe local defaults and empty credential placeholders. Copy files only when absent. Enter owner credentials locally or through the host's secret manager, not in source code, logs, public chat or `NEXT_PUBLIC_` variables. Existing values are never overwritten by setup.

The core local demo needs no API key or database service. Backend startup validates adapter choices and production prerequisites without printing their values. Authentication, OTP, code encryption, and private-link signing use a random local key generated in ignored `backend/.data/session.key` when `SESSION_SECRET` is blank in development.

## Frontend

All origins are full URLs with scheme and optional port, without a trailing slash. An API URL includes the `/api` prefix; socket origin does not. `NEXT_PUBLIC_` values are browser-public and embedded at build time. Rebuild the frontend after changing them.

| Variable | Source / requirement | Read time and use |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_ORIGIN` | Owner's frontend origin; local default `http://localhost:3000` | Build/public and server rendering; canonical URLs, hreflang, Open Graph, sitemap. No purchased domain is assumed. |
| `NEXT_PUBLIC_API_URL` | Browser-reachable API base; local `http://localhost:4000/api` | Build/public; browser HTTP requests with credentials. |
| `API_INTERNAL_URL` | Server-reachable API base; optional, defaults to public API URL | Next server runtime (and any server build fetch); public SSR shop/town/category requests. Never used to cache an authenticated user's data. |
| `NEXT_PUBLIC_SOCKET_URL` | Browser-reachable Socket.IO origin; local `http://localhost:4000` | Build/public; persistent signaling and message notifications. |
| `NEXT_PUBLIC_DEMO_MODE` | `true` for this implementation's demo ledger | Build/public; demo notices. It controls presentation only; setting it false does not add real payment collection. Keep true while payments are demo-only. |
| `NEXT_PUBLIC_IMAGE_ORIGINS` | Optional comma-separated exact origins of owner-controlled image hosts | Build configuration/public validation; Next image `remotePatterns`. Empty permits bundled local illustrations. For uploaded shop images, include the configured API image-delivery origin. Do not add arbitrary user-selected hosts. |

## Backend

These values are read at backend process startup/runtime. Restart the API after a change. They must never be exposed through frontend environment variables.

| Variable | Required / default | Source and effect |
| --- | --- | --- |
| `NODE_ENV` | `development` locally; `production` on host | Host setting. Production requires Mongo, S3, HTTPS frontend origins and a strong session secret; refuses demo OTP and synthetic seeding. |
| `PORT` | Optional; `4000` | Node host's assigned port or local preference. |
| `API_ORIGIN` | Required to match reachable API; local `http://localhost:4000` | Owner API origin. Used for upload URLs and startup URL. |
| `FRONTEND_ORIGINS` | Exact comma-separated allowlist; local `http://localhost:3000` | Owner frontend origins. Controls credentialed CORS, mutation Origin checks and socket handshakes. No wildcard origins. |
| `TRUST_PROXY_HOPS` | Optional non-negative integer; `0` locally | Actual trusted reverse-proxy depth from host topology. Affects client IP/rate limiting; do not guess a broad trust setting. |
| `COOKIE_SAME_SITE` | `lax` default; `strict` or `none` supported | Owner deployment choice. Cookies are host-only, HttpOnly and Secure in production. Unrelated sites still face third-party-cookie limits with `none`. |
| `SESSION_SECRET` | Required in production; at least 32 random characters | Secret manager/password generator. HMAC/session signatures, OTP hashes, private file links and handover-code encryption. Blank development value generates a private local key. |
| `DATABASE_ADAPTER` | `local` or `mongo`; local default `local` | `local` is a single-process durable JSON demo; production requires `mongo`. |
| `DATA_FILE` | Optional; `./.data/sheharmitra.json` | Development JSON path, relative to backend working directory. Never share it between competing API writers. |
| `MONGODB_URI` | Required for `mongo`; blank otherwise | Mongo provider or local replica-set URI. Backend only. Transactions require a replica set; use an isolated database for the pilot. |
| `DEMO_PASSWORD` | Optional development-only override | Owner's local demo preference. Blank uses `DemoPass123!`; applies when seeding, not retroactively. Production never seeds those users. |
| `OTP_PROVIDER` | `demo`, `webhook` or `disabled`; local `demo` | `demo` generates random short-lived one-use codes returned only to the requesting development browser. `webhook` delegates SMS delivery. `disabled` blocks new OTP registration honestly. Production refuses `demo`. |
| `OTP_WEBHOOK_URL` | Required for `webhook`; blank otherwise | Owner's SMS gateway endpoint. Receives POST `{phone, code, expiresInSeconds}` and must send the actual SMS and return 2xx. Use HTTPS. |
| `OTP_WEBHOOK_TOKEN` | Required for `webhook`; blank otherwise | Gateway-issued backend credential, sent as Bearer authorization. Never browser-public. |
| `STORAGE_ADAPTER` | `local` or `s3`; local `local` | Production requires `s3` so uploads survive instance replacement. |
| `UPLOAD_DIR` | Optional; `./.data/uploads` | Local development upload directory. It is never mounted as a public static folder. |
| `S3_REGION` | Required with production S3 | Storage provider region. |
| `S3_BUCKET` | Required with production S3 | Owner's private bucket. Public and private image purposes use different key prefixes; identity files remain private. |
| `S3_ENDPOINT` | Optional; blank for AWS | S3-compatible provider endpoint, if not using standard AWS. |
| `AWS_ACCESS_KEY_ID` | Optional with IAM role; otherwise access-key pair | Storage credentials from the provider. Leave both AWS fields blank to use the AWS SDK credential chain/workload role. |
| `AWS_SECRET_ACCESS_KEY` | Required when using explicit access key | Storage secret paired with the preceding key. Keep backend-only. |
| `STUN_URLS` | Optional comma-separated URLs | ICE/STUN operator addresses. Public server URLs may be returned to authenticated clients. STUN alone does not enable the app's calls. |
| `TURN_URLS` | Required to enable calling | Owner TURN server URLs, including supported transport variants. |
| `TURN_SHARED_SECRET` | Required to enable calling | Coturn REST shared secret. Backend derives temporary one-hour credentials for authenticated callers; the permanent secret never goes into the frontend. |
| `PLATFORM_FEE_PAISE` | Optional integer; `0` | Pilot configuration. Zero by default; amounts are integer paise and shown separately. |
| `PILOT_MAX_VALUE_PAISE` | Optional integer; `500000` (₹5,000) | Maximum accepted goods value for a pilot quote. |
| `PILOT_MAX_WEIGHT_GRAMS` | Optional integer; `20000` (20 kg) | Maximum parcel weight; matching also enforces the selected trip's remaining capacity and parcel size. |

`MONGO_TEST_URI` is a test-only runtime variable read by the optional Mongo smoke test. It must identify a disposable replica-set database. It is not an app integration setting and is intentionally absent from normal `.env.example` defaults.

## What the owner needs to fill in

| Integration | Required owner inputs | Current local behavior |
| --- | --- | --- |
| Hosted database | `DATABASE_ADAPTER=mongo`, `MONGODB_URI` | Explicit durable single-process JSON demo. |
| Hosted secure sessions | `NODE_ENV=production`, strong `SESSION_SECRET`, exact API/frontend origins, proxy count | Generated private local session key; HTTP localhost cookies. |
| Durable uploads | `STORAGE_ADAPTER=s3`, bucket, region, optional endpoint, IAM role or access-key pair | Local development files behind authorization. |
| Real SMS OTP | `OTP_PROVIDER=webhook`, gateway URL and Bearer token, gateway that sends SMS | Labelled random demo OTP, never a universal password. |
| Cross-network audio/video | Reachable TURN URLs and shared secret; optional STUN URLs; HTTPS frontend/API | Calling unavailable with chat fallback. No fake connected state. |
| Hosted public metadata/images | Site/API/socket URLs, server API URL if different, exact public image origins | Local origins and synthetic bundled storefronts. |

No routing key, map key, payment credential, wallet key, testnet token or blockchain private key is requested because those integrations are not enabled. Trip proximity uses ordered seeded route geometry and explicitly labelled distance estimates. The payment-provider interface currently has only a DEMO ledger; real money and Web3 require additional implementation and testing, not merely an environment switch.
