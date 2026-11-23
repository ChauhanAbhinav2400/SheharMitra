# Real-service setup before payments

Checked 20 November 2026. Existing secrets were preserved. Google accepted the Firebase service-account credentials, and Cloudflare issued short-lived TURN credentials (two ICE server entries, 7,500-second TTL). MongoDB ping/transaction topology and S3 bucket metadata checks passed again. Application indexes, a no-op Mongo transaction, and a temporary S3 object upload/download/cleanup passed on 19 November. Automated tests after the signup error fixes: 30 passed, one dedicated Mongo test skipped; both production builds passed. The running local frontend and API health/readiness endpoints responded successfully. No real SMS or audio/video media session was tested.

### Current Firebase status and SMS failure

The follow-up check on 20 November confirms the previous setup blockers are resolved: Phone sign-in is enabled, India is allowed, the frontend configuration matches the registered web app, and `OTP_PROVIDER=firebase`. Both backend and frontend refer to the same Firebase project. Cloudflare still issues valid temporary TURN credentials.

The user's real signup attempt at `http://localhost:3000/en/signup` returned **HTTP 400 `BILLING_NOT_ENABLED`** after reCAPTCHA. This is the immediate SMS blocker. The supplied service account receives HTTP 403 from the Cloud Billing status API, so billing activation cannot be independently verified with these credentials. No billing settings or permissions were changed.

1. Open Google Cloud Console > Billing > My projects and locate the exact project ID in `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Confirm it is linked to an active billing account. Check the billing account's Overview/Payment Overview for suspension, closure, payment verification, or other action-required alerts. A Firebase Blaze selection does not override an inactive linked billing account. See [Google's billing status guide](https://docs.cloud.google.com/billing/docs/how-to/verify-billing-enabled).
2. If the correct project is linked and active, allow a recent activation to take effect and retry once. If Google keeps returning `BILLING_NOT_ENABLED`, contact Cloud Billing/Firebase support with the project ID and error. Do not send private keys or OTPs. Repeated CAPTCHA submissions will not fix a billing rejection.
3. Real SMS testing needs an authorized hosted HTTPS frontend. `localhost` is in this project's authorized-domain list, but Firebase's [phone-auth documentation](https://firebase.google.com/docs/auth/web/phone-auth) explicitly excludes localhost as a hosted domain for phone auth. Hosting the frontend also requires a reachable HTTPS API/socket endpoint and consistent API URLs, CORS and cookie configuration; changing only `authDomain` does not host the app.
4. For local flow testing while billing/hosting is completed, add a fictional Indian test number and fixed code in Firebase Authentication > Sign-in method > Phone > Phone numbers for testing. Currently zero test numbers are configured. Use a synthetic number, never another person's real number. These codes do not demonstrate SMS delivery. Keep test accounts away from admin/resolver roles and remove the test numbers before public operation.

The signup form now shows persistent, translated errors for billing, domain, CAPTCHA, quota, throttling and connectivity, with only the sanitized SDK error code. It shows a localhost notice, prevents overlapping sends, creates a fresh verifier after failed sends, and returns expired verification sessions to the send-code step. It never disables app verification or logs raw Firebase error objects.

Run `npm run check:integrations` to recheck configuration without sending SMS. It now also attempts a read-only billing check and exits unsuccessfully for unsupported real-SMS origins, even when credentials are valid. `npm run check:integrations -- --sync-web-config` can fill missing frontend values from the existing registered web app; it preserves nonempty values. `node scripts/check-services.mjs` separately checks MongoDB/S3 connectivity. Restart/rebuild the frontend after changing its public environment values.

## Firebase phone verification

Real SMS requires Firebase **Blaze**, not the no-cost Spark plan. The Firebase console supports fictional test numbers with predefined codes: those do not send SMS and are useful for testing. Do not treat test numbers as real users, and remove them before public operation. Check your project's SMS pricing/quotas before enabling real traffic. Budget alerts are notifications, not guaranteed hard spending caps.

1. Open https://console.firebase.google.com/ and create/select your project.
2. Project settings → General → Your apps → add a Web app. Copy its web config values into `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_AUTH_PROVIDER=firebase
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

These four Firebase web identifiers are browser-public; they are not service-account secrets. Rebuild the frontend when changing them.

3. Authentication → Sign-in method → Phone → Enable. Configure SMS regions for India and add the actual HTTPS frontend hostname under Authorized domains. Current Firebase documentation does not allow localhost as a hosted domain for phone authentication. Use an authorized hosted HTTPS test domain for real SMS testing. No manual reCAPTCHA key is required: the Firebase SDK handles it. Users must complete any challenge themselves.
4. Project settings → Service accounts → Firebase Admin SDK → Generate new private key. Keep the downloaded file private. Transfer these fields into **backend/.env** (or backend host secrets), never the frontend:

```dotenv
OTP_PROVIDER=firebase
FIREBASE_PROJECT_ID=             # project_id
FIREBASE_CLIENT_EMAIL=           # client_email
FIREBASE_PRIVATE_KEY=""          # private_key, with literal \n escapes inside quotes
```

Alternatively leave client email/private key blank and configure Application Default Credentials on the backend host. The project ID remains required. Restart the backend after changes. Until these values exist, registration is disabled; no demo OTP is accepted in live-service configuration.

The browser sends an ID token over HTTPS. The backend verifies its signature, intended project, revocation and recent phone sign-in, then issues the existing HttpOnly/CSRF session. New users receive buyer permissions only. Linking a previously registered phone requires its current password and preserves server-owned roles. Existing password login remains available. Firebase does not grant seller, delivery, admin or resolver permissions.

## Audio and video: Cloudflare TURN

1. Open https://dash.cloudflare.com/ → Realtime → TURN (the dashboard naming can vary) → create a TURN key.
2. Copy the TURN Key ID and its API token into backend secrets:

```dotenv
TURN_PROVIDER=cloudflare
CLOUDFLARE_TURN_KEY_ID=
CLOUDFLARE_TURN_API_TOKEN=
```

For this provider, leave `STUN_URLS`, `TURN_URLS`, and `TURN_SHARED_SECRET` blank. The backend asks Cloudflare for short-lived ICE credentials. The long-term API token never goes to the browser. Coturn remains supported with `TURN_PROVIDER=coturn`, your server's TURN/STUN URLs and `TURN_SHARED_SECRET`.

Cloudflare currently documents a **1,000 GB free allowance** for TURN and **$0.05/GB** after it; STUN is free. Confirm your account billing terms before enabling usage. This is an allowance, not unlimited free video. Source: https://developers.cloudflare.com/realtime/turn/faq/

Use HTTPS for the frontend and backend, permit microphone/camera access, and keep Express/Socket.IO on an always-running host. Allow WebSocket upgrades; do not run signaling in Vercel functions. Test two real devices on separate networks, including one cellular connection, both call directions, decline/busy/end, disconnect and mic/camera toggles. Credentials being configured does not prove media connectivity. Calls are not recorded.

## MongoDB, S3, domains and roles

`DATABASE_ADAPTER=mongo`, `STORAGE_ADAPTER=s3`, and `DEMO_SEED=false` select real services. Do not run `npm run seed` against the live database. Register real accounts, then grant only your trusted operator admin/resolver roles using `npm run grant-role -w backend -- <existing-user-id> <admin-or-resolver>` on the backend host. The exact command usage is also printed by the script. Sellers and delivery partners use onboarding and manual approval.

Keep S3 Block Public Access enabled. Objects use private ACL defaults; the API authorizes identity/chat/evidence access and issues short-lived URLs. IAM needs `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the application's bucket objects and bucket metadata/list access where required. Do not put AWS keys in frontend env. Check least-privilege IAM and the configured bucket region.

For hosting supply the frontend and backend HTTPS URLs, `FRONTEND_ORIGINS`, `API_ORIGIN`, `NEXT_PUBLIC_SITE_ORIGIN`, `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`, `NEXT_PUBLIC_SOCKET_URL`, a stable random `SESSION_SECRET`, and `NODE_ENV=production`. Prefer sibling custom domains to avoid third-party cookie blocking. Set trusted proxy hops to your actual hosting topology. Existing development origins should not remain in production CORS. Do not use a sleeping backend for reliable calls/chat.

## Payments remain deferred

The app still uses the explicitly labelled simulated ledger to exercise the commerce workflow. No real money is collected, held or paid out. **Do not launch real paid orders with this ledger.** After authentication, all roles, uploads, and cross-network calls are accepted, choose an India-supported marketplace payment provider. The implementation will need server-created orders, verified and idempotent webhooks, separate goods/delivery accounting, merchant/partner onboarding, payout eligibility, cancellation/refund rules and reconciliation. Provider approval and supported marketplace settlement determine what is possible; the app must not describe a basic payment-gateway charge as escrow. No payment credentials are needed at this stage.

## Address lookup and web notifications (November 2026)

The new configuration names have been added to `.env.example` and the local env files, preserving existing credentials. The public messaging sender ID can be derived from the existing Firebase web app ID; the integration checker also supports syncing it from Firebase.

1. In **Firebase Console → Project settings → Cloud Messaging → Web configuration → Web Push certificates**, generate or select the key pair and copy its **public** key into `frontend/.env.local` as `NEXT_PUBLIC_FIREBASE_VAPID_KEY`. The sender ID is `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, from the same project's web app configuration. Keep the existing API key, auth domain, project ID and app ID. Do not copy a private VAPID key or Admin private key into the frontend. Enable Firebase Cloud Messaging API (V1) for this same project if it is disabled, and authorize the backend service account to send FCM messages.
2. In [Geoapify My Projects](https://myprojects.geoapify.com/), create a project, copy its API key, and put `GEOAPIFY_API_KEY=...` and `GEOCODING_PROVIDER=geoapify` in `backend/.env`. This key stays on the backend. Review your account quota and apply suitable server-side key restrictions in Geoapify. `GEOCODING_PROVIDER=disabled` deliberately turns lookup off.
3. Restart both servers. Public frontend env values are bundled: rebuild the frontend for a production deployment. Open **Updates → Enable on this device** and grant browser permission on each desired device. The app does not prompt on first load. Refresh an already-open tab after rebuilding.

The existing Firebase Admin credentials send push; no additional Admin private key is needed. A single service worker handles the offline fallback and FCM. The generated `/firebase-messaging-sw.js` contains only public web configuration. No push message contains full addresses, handover codes, or chat text. Notification category settings control push delivery; the in-app activity inbox remains available.

Address forms accept manual entry when geocoding is unavailable. Unresolved locations are saved as **not verified**, shown to their owner and the admin, and cannot produce a route match until coordinates are resolved. Current-location permission is requested only on the button click. Check the returned address before saving. An edited location is resolved again; an unchanged legacy shop retains its saved coordinates. Existing trips keep their route data. Route matching uses straight-line proximity and estimated schedule progress, not a road-routing or traffic estimate. Confirm the exact pickup time by chat or call.

Optional backend defaults:

```dotenv
MATCH_PROXIMITY_KM=3
MATCH_TIME_WINDOW_MINUTES=15
DISPUTE_WINDOW_HOURS=48
DISPUTE_RESPONSE_HOURS=48
```

The dispute window runs from delivery; replies have their own deadline. A resolver can decide when the deadline passes or all other involved parties have replied. The decision records a `SettlementInstruction` with integer-paise allocations and `pending_payment_execution` status. Repeated requests cannot record another decision. Closing a reviewed case does not execute this instruction. Existing demo payment behavior is otherwise unchanged: report a problem before confirming final receipt/settlement.

## Staff access and review

After signing in, an `admin` goes to `/admin` and a `dispute_resolver` goes to `/resolver`. These identities cannot shop, chat, create trips, or perform marketplace actions, including when an old record has mixed roles. Use a separate ordinary account to test buying/selling. The legacy `resolver` role is recognized.

From the trusted backend host, grant an existing account using:

```text
npm run grant-role -w backend -- <existing-user-id> admin
npm run grant-role -w backend -- <existing-user-id> dispute_resolver
```

There is no public role-grant API. Granting a role replaces marketplace roles, revokes app sessions/push tokens, suspends the account's shops and withdraws its trips; order history remains. Sign in again afterward. Ban/unban, shop moderation, application decisions, case access, evidence access and resolver decisions are audited. Ban immediately revokes local sessions and removes push tokens; Firebase refresh-token revocation retries if Google is temporarily unavailable. Unbanning restores login eligibility but does not automatically republish shops or trips. For sensitive staff decisions, sign out and sign in again first.

Resolvers can browse the whole queue. Opening a case is logged and enables explicit short-lived access to its order evidence and chat images. Only the assigned reviewer can decide; conflicting participants cannot take a case. Admins can assign/reassign before the decision. A closed review still has a pending payment instruction.

## Calls, push limits and verification matrix

The signaling backend currently supports **one always-running instance**. Mongo transactions arbitrate busy state and the winning device; Socket.IO rooms are process-local. Do not scale horizontally until a distributed socket adapter and instance-aware call recovery are implemented. A backend restart records interrupted calls as failed. The call duration uses server timestamps after both selected endpoints report a connected peer connection; it is not independent proof of media quality. No call media is recorded.

Incoming calls appear in every connected callee tab/device. The first acceptance wins, the other panels close, and a decline closes the invitation everywhere. Browser sound needs prior user interaction and may be suppressed by the browser or OS. A closed/suspended browser cannot behave like a native phone dialer. Push delivery depends on the browser, network, OS settings and Firebase. On iPhone/iPad, web push requires a supported OS and an app added to the Home Screen. Incoming pushes expire after 30 seconds; opening one after expiry will not revive the call. Audio-output selection appears only when the browser supports it; otherwise use the device controls.

| Check | Expected result | Verification |
| --- | --- | --- |
| New manual address, denied location permission, missing Geoapify key | Save allowed, clear fallback, unverified notice, no false route match | API regression covered; device permission UI remains manual |
| Buyer vs seller vs assigned/unassigned partner | Private address hidden from unassigned accounts; delivered check/report instructions only for buyer | API/text regression covered |
| Two callee tabs accept simultaneously | Both ring; exactly one wins; other cannot signal/end the active call | Socket regression covered |
| Secondary tab disconnect, decline, duplicate end | Active call survives secondary disconnect; one history entry per call | Socket regression covered |
| Real audio/video on Wi-Fi and cellular | Both directions, microphone/camera, timer, minimise/fullscreen, front/back and output control where supported | Requires two-device media check |
| FCM in background, logout, invalid token, open chat | Correct language/category/deep link; no duplicate open-chat alert; token cleanup | Outbox regression with stub delivery covered; real push awaits key/device check |
| Chrome/Edge/Android; iPhone Home Screen | Permission and background restrictions shown honestly | Device checks pending |
| Admin/resolver isolation, ban, concurrent take, duplicate decision | Forbidden marketplace access; revoked sessions; one claim and one immutable pending instruction | API regression covered |
| 360px and 1280px, Hindi and English | Address, call, notifications and staff layouts readable, no clipped controls | Responsive styles implemented; visual check blocked by computer-use URL restriction |

Run `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build`. Tests override provider settings and use synthetic local stores. The Mongo replica-set mutation test stays skipped unless an explicit isolated test database is supplied. `node scripts/preview-local.mjs` starts a separate synthetic preview at port 3100 with an API at 4100; it does not use the live Mongo/S3 adapters. Stop it with Ctrl+C. The current store remains a pilot implementation with a 10,000-record guard per collection; migrate to paginated repositories before exceeding that limit.

Sources: [Firebase receive messages](https://firebase.google.com/docs/cloud-messaging/web/receive-messages), [Firebase web client configuration](https://firebase.google.com/docs/cloud-messaging/js/client), [Geoapify reverse geocoding](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/), [WebKit Home Screen push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Acceptance sequence

Matching location correction: forward lookup now validates the returned town and state. A postcode-only result or a similarly named different town is not treated as an exact address. If a precise address is unavailable, an unambiguous structured city/state result can supply an explicitly labelled area estimate. Calls/chat should confirm exact collection and delivery points. This uses Geoapify's [result types and confidence fields](https://apidocs.geoapify.com/docs/geocoding/forward-geocoding).

When finding matches, proposing a fee or confirming delivery, legacy matching locations can be refreshed. Only unchanged address snapshots are updated; accepted quote versions stay immutable. Explicit device locations are preserved, and unknown legacy pins are retained unless they reproduce the old forward-geocoder result. The 3 km route tolerance, direction, category, timing and independent approved-partner checks remain in effect. Empty match results now include plain-language reasons. The Nagina–Raipur Sadat wrong-town/postcode regression and reservation flow are covered by automated tests.

Interaction fixes: call panels respond immediately to start, answer and hangup. Each outgoing attempt has a client-generated ID, so a cancelled or timed-out invitation can be ended even if its acknowledgement arrives late. Call lifecycle changes are ordered on the signaling instance; authentication, calls and notification delivery read only their relevant collections. Fresh ICE credentials are reused briefly within the call controller.

Two people share one conversation regardless of buyer/seller role or shop/order entry point. Existing duplicate thread IDs remain valid and show combined history without deleting messages. Trip owners can edit future trips before a buyer confirms delivery; editing expires pending fee agreements, and confirmation locks the trip against concurrent edits.

`node scripts/check-interactions.mjs` runs an isolated Chrome check on ports 3100/4100 using synthetic local accounts and fake media. It verified an audio connection, immediate local hangup, a reverse video callback with both peers connected, and a prefilled trip edit saved through the API. External TURN and two-device/mobile network checks remain separate. The interaction regression suite passes 64 tests; the optional Mongo replica-set test is skipped without a disposable test database.

1. Fill Firebase and Cloudflare placeholders locally; restart backend and rebuild frontend.
2. Register buyer/seller/partner on the HTTPS test site; verify wrong codes and repeated attempts fail.
3. Grant admin separately; approve shop and synthetic test identity submission. Verify unrelated users cannot view documents/orders.
4. Publish a real test trip, agree a quote/fee and use **simulated payment only**. Verify ready/pickup/delivered panels for each participant and the delivered popup; receipt must still permit a problem report before settlement.
5. Test image uploads and authorized access with two accounts.
6. Run the two-device audio/video checklist above. Only then discuss live payment onboarding.

References: https://firebase.google.com/docs/auth/web/phone-auth · https://firebase.google.com/docs/auth/limits · https://firebase.google.com/docs/auth/admin/verify-id-tokens · https://developers.cloudflare.com/realtime/turn/generate-credentials/
