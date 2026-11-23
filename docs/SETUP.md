# Local setup and owner deployment

Use Node.js 22 LTS (at least 22.0.0), npm 10 or newer, and a recent browser. The repository is an npm workspace: install once at its root. VS Code's integrated PowerShell terminal works on Windows. A local MongoDB replica set is optional for the first demo; the explicit `local` adapter persists synthetic records to a JSON file and needs no credentials.

## Windows / VS Code

Open the project folder in VS Code, open **Terminal → New Terminal**, and run:

```powershell
npm ci
if (!(Test-Path -LiteralPath 'backend/.env')) {
  Copy-Item -LiteralPath 'backend/.env.example' -Destination 'backend/.env'
}
if (!(Test-Path -LiteralPath 'frontend/.env.local')) {
  Copy-Item -LiteralPath 'frontend/.env.example' -Destination 'frontend/.env.local'
}
npm run brand
npm run seed
npm run dev
```

The copy commands preserve existing environment files. If PowerShell blocks `npm.ps1`, use `npm.cmd` in these commands. Open `http://localhost:3000/hi` or `/en`. The API runs at `http://localhost:4000`; process health is `/health` and database readiness is `/ready`. Use `localhost` consistently: cookies and allowed origins do not treat it as interchangeable with `127.0.0.1`.

`npm run seed` replaces **all data in the selected development database** with the synthetic demo. Run it only against a disposable demo database, with the API stopped. The seed uses current UTC-relative times, so repeat it before a new demonstration if trips or quotes have expired. Production mode refuses demo seeding. Ordinary startup preserves existing data; an empty development store is seeded automatically.

## macOS / Linux

```sh
npm ci
[ -f backend/.env ] || cp backend/.env.example backend/.env
[ -f frontend/.env.local ] || cp frontend/.env.example frontend/.env.local
npm run brand
npm run seed
npm run dev
```

Stop both services with Ctrl+C. To run separately, use `npm run dev -w backend` and `npm run dev -w frontend` in two terminals. Always use the workspace commands so dotenv resolves `backend/.env` relative to the correct directory.

## Synthetic demo sign-ins

Default password for every row is `DemoPass123!`. A custom `DEMO_PASSWORD` in `backend/.env`, set **before reseeding**, changes it for all demo accounts. These are synthetic local credentials, never real customer records.

| Account | Phone | Capabilities |
| --- | --- | --- |
| Seema / buyer | `9000000001` | Buyer; owns both seeded orders |
| Amit / seller | `9000000002` | Buyer and seller; owns the eight demo shops |
| Ravi / delivery partner | `9000000003` | Buyer and manually approved demo delivery partner |
| Demo reviewer | `9000000004` | Buyer and admin reviewer |
| Demo resolver | `9000000005` | Buyer and resolver; must be assigned a case |
| Pending partner | `9000000006` | Buyer; delivery approval pending |
| Anita / second buyer | `9000000007` | Buyer; useful for access checks |
| Mohan / replacement partner | `9000000008` | Buyer and approved replacement delivery partner |

Different browser profiles, Chrome versus Edge, or a normal plus private window provide independent sessions. Tabs in one profile share the same login. The workspace switcher changes capabilities within one account, not identities. Seeded manual approvals are for the demo and do not represent government verification.

## MongoDB replica set on the same computer

Install and start Docker Desktop with Linux containers, then run:

```sh
docker compose up -d --wait
docker compose ps
```

The supplied compose file starts one MongoDB 8.0 node, initializes replica set `rs0`, waits until it is primary, and keeps records in a named volume. Its unauthenticated port is bound only to `127.0.0.1`; this configuration is for local development. Replica-set initialization follows [MongoDB's development procedure](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-for-testing/).

Set these values in **backend/.env**, then seed and start the API:

```dotenv
DATABASE_ADAPTER=mongo
MONGODB_URI=mongodb://127.0.0.1:27017/sheharmitra?replicaSet=rs0&directConnection=true
```

```sh
npm run seed
npm run dev
```

`directConnection=true` is intentional for a host application connecting to this one local container. A standalone MongoDB without a replica set cannot execute the booking and settlement transactions. For a remote database, use its provider-issued connection string instead; do not copy this unauthenticated local configuration to a public server.

Stop MongoDB with `docker compose down`; the named volume is retained. Reseeding resets the selected demo database without deleting the volume. If port 27017 is occupied, stop the conflicting local service or adjust the host port and URI together.

Optional Mongo transaction smoke test, using a **separate disposable database**:

```powershell
$env:MONGO_TEST_URI = 'mongodb://127.0.0.1:27017/sheharmitra_test?replicaSet=rs0&directConnection=true'
npm test
Remove-Item Env:MONGO_TEST_URI
```

```sh
MONGO_TEST_URI='mongodb://127.0.0.1:27017/sheharmitra_test?replicaSet=rs0&directConnection=true' npm test
```

Without `MONGO_TEST_URI`, that smoke test is explicitly skipped; the local transaction, commerce, and HTTP security tests still run. Do not point tests at a database containing records you want to retain.

## Checks and production build

```sh
npm run typecheck
npm test
npm run build
```

The Next build downloads and self-hosts Baloo 2 and Mukta through `next/font/google`; build-time network access to Google Fonts is needed, but page visitors make no runtime Google Fonts requests. The separate production start commands are `npm run start -w frontend` and `npm run start -w backend`. A production backend requires the production configuration below; local JSON, local upload storage and demo OTP are intentionally rejected in that mode.

## Owner-managed deployment

No site, server, domain, paid resource or account has been created. The owner chooses hosts and supplies configuration. Keep the Express API and Socket.IO process on the separate Node host; the frontend's Next functions must not own persistent connections or durable uploads.

For the frontend on Vercel, import this repository as a monorepo, select the `frontend` root and the Next.js preset, retain the root npm lockfile/workspace installation, and use `next build` from the frontend root. If overriding installation, run `cd .. && npm ci`. Set the six frontend environment variables described in [ENVIRONMENT.md](ENVIRONMENT.md). Rebuild when a `NEXT_PUBLIC_` value changes. Vercel documents the relevant [monorepo selection](https://vercel.com/docs/monorepos) and [build settings](https://vercel.com/docs/builds/configure-a-build).

For the API host, install from the repository root with `npm ci`, build with `npm run build -w backend`, and start with `npm run start -w backend`. Set `NODE_ENV=production`, `DATABASE_ADAPTER=mongo`, a transaction-capable Mongo connection, a random `SESSION_SECRET`, `STORAGE_ADAPTER=s3` and the S3 settings. Choose `OTP_PROVIDER=webhook` with a functioning SMS gateway, or `disabled` to make new registrations explicitly unavailable. Production does not create the known demo users. Provision the first user through registration while the real OTP webhook is enabled, then grant a privileged role from the trusted host using `npm run grant-role -w backend -- <registered-user-id> admin`; use `resolver` for a resolver. Public registration never accepts those privileges. Disable new OTP registrations only after any needed accounts have been provisioned.

Use sibling custom domains such as `app.example.com` and `api.example.com` on a domain the owner controls. Set exact `FRONTEND_ORIGINS=https://app.example.com`, `API_ORIGIN=https://api.example.com`, `COOKIE_SAME_SITE=lax`, and `TRUST_PROXY_HOPS` to the actual trusted proxy count. Set the frontend API URL to `https://api.example.com/api` and socket URL to `https://api.example.com`. These are examples, not purchased or assumed domains.

An unrelated Vercel default domain and backend default domain may trigger third-party-cookie blocking even with `SameSite=None; Secure`. A workable alternative to sibling domains is a trusted same-site reverse proxy routing both `/api` and `/socket.io` to the API, with WebSocket upgrades. Keep both paths and credentials on the same public origin; do not attempt a persistent Socket.IO server inside a Vercel function. Add the resulting exact frontend origin to backend configuration.

Health probes use `/health` for liveness and `/ready` for readiness. Allow WebSocket upgrade traffic and reverse-proxy timeouts longer than Socket.IO heartbeats. The current signaling busy registry requires **one API signaling process**; distributed atomic state and a Socket.IO adapter are needed before horizontal scaling. A sleeping backend interrupts chat and calls. Public pages fetch uncached approved shop records; approval changes, edits and closures appear on the next fetch rather than requiring cache invalidation. Keep private authenticated data out of public CDN caches.

## Operations

Back up MongoDB and the upload bucket with restricted access. In the local demo, keep `.data/session.key` with the data if preserving encrypted handover codes. Rotating that key invalidates existing sessions, OTP hashes, private links and code decryption; plan a controlled migration for real records.

Run `npm run cleanup -w backend` for expired auth records and unreferenced uploads older than 24 hours. The explicit `-- --prune-reviewed-identity` option additionally removes identity/selfie images for completed reviews older than 30 days, retaining an audit event and review metadata. The app does not delete cancelled/completed orders after a few days. See [backend.md](backend.md) for storage access, retention and signaling details, and [commerce.md](commerce.md) for transition rules.

When using `DATABASE_ADAPTER=local`, stop the API before running any maintenance command that writes the same JSON store, including seed, cleanup and grant-role. The local mutex protects one process only; independent maintenance and API writers must not run concurrently. Mongo mode uses database transactions for those writes.
