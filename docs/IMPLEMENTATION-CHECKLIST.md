20 November 2026 manual-test fixes: existing uploaded shop image verified over HTTP as 200 image/webp; public images now serve stable bytes instead of cached redirects to expiring S3 URLs, and normalized uploads bypass the Next image optimizer. Approved shops remain visible to owners; their own shop page links to Profile instead of message/call/order actions. Confirmed the live conversation lacked readAt; Mongo schemas now preserve empty maps and chat endpoints tolerate existing missing maps without a data reset. Regression suite: 36 passed, 1 dedicated Mongo test skipped; both production builds passed. Buyer-to-seller manual browser retest remains with the user.

20 November 2026 follow-up: see [LIVE-SETUP.md](LIVE-SETUP.md). Firebase Phone/India policy and matching frontend web config now pass; the backend uses Firebase. The user's SMS attempt returns BILLING_NOT_ENABLED, and the service account cannot inspect billing (HTTP 403). Localhost is also unsupported for hosted real-SMS phone auth. Cloudflare issues temporary TURN credentials. Added specific bilingual signup errors and safer retries; automated suite: 30 passed, 1 isolated Mongo test skipped. Earlier MongoDB/S3 connectivity and local HTTP checks passed. Actual SMS and two-device media remain unverified. Earlier implementation notes follow and describe earlier checkpoints.

# Implementation and verification

The repository is a local pilot application. No hosting was purchased and nothing was deployed.

Implemented:

- Next.js App Router public Hindi/English marketplace, town/category/shop routes, metadata, language alternatives, LocalBusiness JSON-LD, sitemap, robots, manifest and generic offline fallback.
- Express/Mongoose backend, durable explicit local demo adapter, replica-set Mongo adapter, environment validation, setup and reproducible seeds.
- Sign-in, signup with one-time demo OTP, session cookies, CSRF, request limits, role checks and private uploads.
- Shop onboarding, manual approval, availability control; delivery identity/selfie submission and reviewer decisions.
- Versioned quotes with multiple line items, buyer acceptance, fee proposals/counteroffers, buyer booking, matching, capacity reservation and demo funding.
- Seller preparation and packaging, distinct handover codes, pickup/delivery, settlement, cancellation/rematching, incident records, disputes and component-aware decisions.
- Persistent chat with image attachment, unread counts, Socket.IO reconnect/refetch and order notifications.
- WebRTC offer/answer/ICE client, incoming consent, microphone/camera controls, end/disconnect cleanup and server busy locks. No call succeeds without actual media connectivity.
- Trip publication, available trips, account workspaces, large text, help, bilingual copy and development style guide.
- Original source-logo processing and synthetic storefront illustrations.

Verification:

- Backend integration suite: 25 passed, one Mongo replica-set smoke test skipped without `MONGO_TEST_URI`.
- Backend and frontend TypeScript checks passed.
- Both production builds passed during implementation; repeat after any further source edit.
- HTTP public-page and privacy smoke checks passed for 12 endpoints plus the unauthenticated-order privacy check: `node scripts/smoke-http.mjs` while both servers run.
- Visual browser checks could not run: the computer-use browser host returned `The browser access host is unavailable`. Mobile/desktop screenshots and Lighthouse scores have **not** been verified. Do not treat CSS breakpoints as proof of accessibility or overflow results.
- No live Mongo, S3, SMS, TURN/media, or Docker runtime validation without their infrastructure. Socket signaling authorization and busy/consent logic are covered by integration tests.

Known pilot constraints:

- Routing uses geometric estimates; trip creation supports an ordered start/end line. Curved route waypoints can be supplied through the validated trip API. No road-routing service is configured.
- New buyer orders allow explicit destination coordinates, prefilled with labelled illustrative values. No map picker or geocoding service is configured.
- Shop onboarding/editing supports a storefront, optional gallery and bilingual representative items. Content edits require renewed approval; availability toggles preserve approval.
- Complaints must be raised before final demo settlement in this pilot. There is no automated reversal of an already released ledger payout.
- Mongo unit-of-work snapshots and in-process call locks are pilot limits described in `commerce.md` and `backend.md`.
- Real payments, passenger services, and optional blockchain extension remain disabled.
