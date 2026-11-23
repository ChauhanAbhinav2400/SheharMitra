# Backend, privacy, and deployment

The API is a separate Express/Socket.IO service. It runs locally at `http://localhost:4000`; Next.js runs at `http://localhost:3000`. No hosting resources have been created. Use Node 22 or newer. The local adapter writes synthetic demo records to `backend/.data/sheharmitra.json`; it is explicitly a single-process development adapter. The Mongo adapter uses Mongoose entity collections and replica-set transactions. Do not use the local JSON adapter for production or launch two local API writers against the same file.

## Authentication and origins

`GET /api/auth/me` (or `/csrf`) creates a pre-authentication session and returns `{user,csrfToken}`. Every mutation, including login and OTP requests, must send `credentials: include`, an exact allowed `Origin`, and `X-CSRF-Token`. Login rotates the opaque session token and CSRF token. The cookie is HttpOnly, host-only, seven days, and Secure in production. Only an HMAC of its random token is persisted. Passwords use bcrypt cost 12. User-supplied roles are rejected. OTPs are random per request, HMAC-protected, expire after five minutes, and allow five verification attempts. Demo OTPs are returned to the requesting browser only in development; production refuses the demo provider.

Use `app.example.com` for Vercel and `api.example.com` for the API, on a domain you control. Set exact `FRONTEND_ORIGINS=https://app.example.com`, `API_ORIGIN=https://api.example.com`, `COOKIE_SAME_SITE=lax`, HTTPS, and `TRUST_PROXY_HOPS` to the actual trusted reverse proxy depth. Do not set broad trust-proxy or wildcard credentialed CORS. An unrelated `*.vercel.app` frontend and `*.onrender.com` backend require SameSite=None/Secure but third-party-cookie blocking may still prevent sessions. The supported strategy is sibling custom domains; otherwise route the whole API and Socket.IO endpoint through a trusted same-site reverse proxy that supports WebSockets. Do not place persistent connections in Vercel functions.

Public APIs can be fetched by Next server rendering without forwarding user cookies. Private API responses use `private, no-store` and `X-Robots-Tag: noindex, nofollow`. Do not fetch private data into a shared Next cache. HTTPS is required for production cookies and browser microphone/camera access.

## Runtime environment

Every backend variable is read at process startup/runtime, never bundled into the browser. Copy `backend/.env.example` to `.env` for local use; the file is ignored by Git. The app never prints configured secrets.

| Variable | Required / source | Purpose |
| --- | --- | --- |
| NODE_ENV | development locally; production on host | Enables strict production configuration and Secure cookies; disables auto demo seed |
| PORT | optional, host/default 4000 | API listening port |
| API_ORIGIN | public API origin | Absolute upload links and local startup URL |
| FRONTEND_ORIGINS | exact comma-separated frontend origins | Credentialed CORS, CSRF Origin validation, Socket.IO handshake |
| TRUST_PROXY_HOPS | default 0; hosting proxy count | Correct client IP and rate limits behind a trusted proxy |
| COOKIE_SAME_SITE | lax by default | Cookie same-site policy |
| SESSION_SECRET | production required, random 32+ characters from secret manager | Session/OTP HMAC, upload signatures, encrypted handover codes; development creates ignored `.data/session.key` |
| DATABASE_ADAPTER | local or mongo | Local demo / Mongoose persistence |
| DATA_FILE | local default `.data/sheharmitra.json` | Local demo data file |
| MONGODB_URI | required for mongo, from MongoDB/Atlas or local replica set | Backend-only database connection |
| DEMO_PASSWORD | optional, development only | All synthetic demo accounts; documented default `DemoPass123!` |
| PLATFORM_FEE_PAISE | optional, default 0 | Explicit platform fee in integer paise |
| PILOT_MAX_VALUE_PAISE | optional, default 500000 | Maximum accepted goods value in integer paise (₹5,000) |
| PILOT_MAX_WEIGHT_GRAMS | optional, default 20000 | Maximum parcel weight in grams (20 kg) |
| OTP_PROVIDER | demo, webhook, disabled | Local random demo OTP / owner SMS adapter / unavailable registration |
| OTP_WEBHOOK_URL, OTP_WEBHOOK_TOKEN | webhook required, from owner's SMS gateway | HTTPS POST `{phone,code,expiresInSeconds}` with Bearer token; endpoint must send the SMS and return 2xx |
| STORAGE_ADAPTER | local or s3; production requires s3 | Durable upload adapter |
| UPLOAD_DIR | local default `.data/uploads` | Development upload files |
| S3_REGION, S3_BUCKET | required for production storage | Private S3-compatible bucket |
| S3_ENDPOINT | optional, storage vendor | Custom S3 endpoint; omitted for AWS |
| AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY | optional, provider credentials | Leave both empty for IAM role/default AWS credential chain |
| STUN_URLS | optional, comma-separated | Public STUN endpoints supplied to authorized callers |
| TURN_URLS, TURN_SHARED_SECRET | required for calling, from TURN operator | Coturn REST temporary credentials; private shared secret stays on backend |

There is no enabled payment gateway, blockchain, or external routing integration, so no unused credentials are requested. Payment ledger is DEMO only. Geometric trip matching is explicitly an estimate. A real payment provider and routing provider require additional implementation before enabling real use.

## Uploads and verification

`POST /api/uploads` accepts a multipart `file` and `purpose` (`identity`, `selfie`, `chat`, `shop`, `packaging`), with `conversationId` or `orderId` where required. JPEG/PNG/WebP only, at most 5 MB, at most 20 million decoded pixels. Sharp decodes, removes metadata/EXIF and re-encodes WebP at at most 1600×1600; SVG, PDF and executable content are not served. Store images in separate `public/` and `private/` key prefixes; the bucket itself may remain private. Shop images are delivered via the API's public image endpoint. Never expose the local upload directory through a static server.

Identity is reviewed manually. Voter ID, driving licence, passport and another government ID are supported; Aadhaar is not mandatory. Only the last four licence/vehicle characters are stored, and no full identity number is collected. For motor vehicles those fields are required; bicycle onboarding does not request them. A selfie is submitted for manual review and does not prove identity. The demo approval is not government verification.

`GET /api/uploads/:id/access` authorizes each explicit view, records an audit event, and returns a URL lasting 60 seconds. Local private URLs additionally require the signed-in authorized session; S3 URLs are short-lived bearer URLs. Never paste or log them. Identity access is restricted to its owner and admin reviewers; chat images are conversation-member only; packaging images are order-participant or assigned-resolver only. Admin self-review is refused. Admin approval/rejection requires a reason.

Use `npm run grant-role -w backend -- <registered-user-id> admin` or `resolver` from the trusted backend host to grant the first privileged role. The HTTP API never grants itself authority and production never creates known demo credentials. Keep database and host access limited.

## Chat and calling

Messages persist in the database, retain their original language, use client IDs for safe retries, and mark read timestamps per member. Chat lists expose only member conversations. Buyer/seller discussions may start from a shop; order threads permit buyer/selected partner negotiation and seller/assigned partner coordination. New messages and order updates use per-user Socket.IO rooms. Clients reconnect and refetch message history; socket delivery itself is not the system of record.

Calls are genuine WebRTC peer connections. The signaling server verifies session and membership, reserves both participants atomically in one Node process, supports incoming consent, reject/busy/offline states, a 30-second ring timeout, end/disconnect cleanup, and relays bounded SDP/ICE payloads only after acceptance. No call recording exists. `GET /api/calls/ice` returns temporary one-hour TURN credentials to authenticated users. Without configured TURN, `available:false` disables calls with chat fallback. HTTPS, browser permissions, a reachable TURN server and two browsers/devices are needed for an end-to-end call test.

**Run one signaling process** for this pilot. The busy registry is in-process. Before horizontal scaling, add a distributed atomic busy store plus a Socket.IO adapter and sticky-session strategy. Mongo commerce transactions remain safe across competing processes, but multi-instance calls are not currently supported. Configure reverse-proxy WebSocket upgrades and idle timeouts above Socket.IO heartbeats. Sleeping/idle backend hosting will interrupt active chat/calls and is unsuitable for dependable calling.

## Operations and retention

`GET /health` checks the process; `/ready` checks database readiness. SIGINT/SIGTERM stop new connections, close sockets and database, and exit with a ten-second shutdown deadline. Expired incomplete delivery reservations are released every 30 seconds and also through commerce mutations. Build with `npm run build -w backend`, start with `npm run start -w backend`.

Run `npm run cleanup -w backend` regularly to remove expired sessions/OTPs and unreferenced uploads older than 24 hours. Optional `-- --prune-reviewed-identity` removes documents for completed reviews older than 30 days and records a deletion audit; keep manual-review status and minimal metadata. Publish this retention policy before collecting real documents, and adapt it to your operational obligations. Completed/cancelled orders, messages, accepted terms, custody history, disputes and payment events are retained rather than deleted after a few days. Back up MongoDB and the upload bucket with access controls; back up local `.data/session.key` together with development data if keeping local handover codes.

The generic pilot unit-of-work is bounded to 10,000 rows per collection; migrate to targeted repositories before scaling. This is a tested pilot implementation, not a claim of production security certification. Optional blockchain and real money are disabled.
