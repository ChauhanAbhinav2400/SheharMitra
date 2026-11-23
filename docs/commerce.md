# Commerce, state and integrity

The executable rules live in `backend/src/domain/service.ts`; routes validate requests with Zod and invoke this service. Money is always integer paise. Only supported parcel categories are accepted. The default pilot limits are ₹5,000 goods value and 20 kg per parcel, configurable through `PILOT_MAX_VALUE_PAISE` and `PILOT_MAX_WEIGHT_GRAMS`. Platform fees default to zero.

## State transitions

| Current order | Actor/action | Conditions and result |
| --- | --- | --- |
| `awaiting_quote` / `quote_proposed` | Shop owner proposes quote | Server computes line totals and goods total; creates a new immutable version. |
| `quote_proposed` | Buyer accepts current version | Not expired; explicit substitution consent if requested. Copies the accepted quote and enters `awaiting_delivery_partner`. |
| `awaiting_delivery_partner` | Buyer proposes fee to a trip | Approved independent partner, compatible route, direction, category, size, capacity and times. This is only an offer. |
| Offer proposed | Named partner accepts/counteroffers | Partner must still be approved. Buyer must accept final fee separately. |
| `awaiting_delivery_partner` | Buyer confirms accepted/countered offer | Atomically checks compatibility again and reserves weight plus one parcel. Only one active assignment; 10-minute funding reservation. |
| `delivery_reserved` | Buyer funds DEMO ledger | Requires unexpired reservation. Separates goods, delivery and platform amounts. Assignment becomes committed; order becomes `confirmed`. |
| `confirmed` | Partner reconfirms readiness | Stores timestamp; does not start preparation. |
| `confirmed` | Seller prepares | Funded payment and committed partner required. Food additionally needs readiness within 15 minutes and preparation near the accepted ready time. |
| `confirmed` / `preparing` | Seller marks ready | Ordinary goods can skip preparing. Food cannot. Seller-owned packaging upload tied to this order plus declared contents required. |
| `ready` | Assigned partner enters seller's pickup code | Distinct random code, expiry and five-guess limit. Records pickup custody timestamp. |
| `picked_up` | Assigned partner enters buyer's delivery code | Records delivery timestamp and frees trip capacity. Payment remains funded so the buyer can raise an issue. |
| `delivered` | Buyer completes | Exactly one goods release to seller and delivery release to partner; no real money moves. |
| Before preparation | Buyer/seller cancels | Releases capacity; funded components are refunded in the demo ledger. |
| Before pickup | Partner cancels | Goods remain funded where feasible; delivery fee refunded, capacity released, fresh buyer fee approval required for replacement. Food already prepared enters review. |
| After preparation / pickup | Buyer/seller cancellation or incident | Opens dispute. After pickup custody remains `incident`; no ordinary rematching. Contact, waiting and return notes are separate timeline events. |
| `disputed` | Admin assigns independent resolver | Resolver role must exist; participant cannot resolve their own case. |
| `disputed` | Assigned resolver settles with rationale | Goods and delivery allocations bounded separately. Unaffected component protected. Partial refund recorded; capacity freed; one terminal settlement. |

Order, assignment, payment and dispute have distinct states. The timeline records structured changes and is separate from private chat. Completed and cancelled orders remain stored and are listed with `GET /api/orders?archived=true`.

## Quotes, acceptance and payment

Quote versions remain in the order history. Revising an unfunded quote removes its acceptance and expires fee offers/reservations. Once goods are funded, a seller cannot silently revise the quote: cancel before preparation, or use review after preparation. Accepted snapshots never have their prices or timing edited in place.

The `PaymentProvider` interface and `DemoPaymentProvider` in `domain/payments.ts` validate component events. The ledger records `fund`, `release`, `refund` and `partial_settlement`. Only demo money exists. There is no live payment processor, COD policy or blockchain deployment. The optional Web3 extension is deliberately absent; no invented transaction hashes are returned.

Reservation, funding, completion and resolver settlement require `Idempotency-Key` (8–120 characters). A retry with the same key and operation returns current order state without another ledger entry or reservation. Reusing a key for different terms is rejected. Fee negotiation never updates payment through chat.

If a courier cancels after goods funding, the delivery component is refunded and set to zero. A replacement's fund event charges only the newly accepted delivery component; goods are not funded a second time.

## Storage and concurrency

`DATABASE_ADAPTER=local` is an explicit single-process development adapter. `LocalStore` serializes transactions, clones state for rollback, and writes a temporary file followed by an atomic rename. Data survives restarts. Do not run two API processes against the same JSON file. Production config refuses this adapter.

`DATABASE_ADAPTER=mongo` uses Mongoose with separate collections, incremental writes and a MongoDB transaction per mutation. A shared revision write causes concurrent transactions to conflict and retry against fresh state, protecting trip reservations and payment settlements across API processes. A replica set is mandatory, including locally. Indexes cover shop town/category/tokens/slug, user phone, upcoming trips, order actor/status, conversation membership, message ordering/idempotency, session expiry and upload owner/purpose.

This is a deliberately bounded pilot repository: a transaction reads at most 10,001 records per collection and refuses operation above 10,000. It prioritizes a simple auditable unit of work and serializes writes globally. Before growing beyond the pilot, replace broad unit-of-work snapshots with feature repositories and narrower transaction reads. It is not a claim of large-scale production throughput. Public shop search already queries indexed Mongo fields directly with bounded pagination.

Reservation expiry runs every 30 seconds and at order reads/mutations. An unfunded 10-minute reservation releases its capacity. Capacity is also released on eligible cancellation, delivery, or final dispute decision. Delivered parcels do not occupy trip capacity while their payment review remains open.

## Matching and search

Matching projects pickup and drop-off onto ordered route segments. Pickup must occur before drop-off. It checks both waypoint proximity (twice perpendicular distance as extra travel), departure/arrival interpolation, pickup flexibility, ready/pickup window, deadline, weight, size, parcel count and category. Only upcoming available trips from approved independent partners are eligible. The seeded reverse-direction, expired and unapproved trips are excluded from matches.

Distances and arrival interpolation are geometric estimates, not road navigation. The synthetic route and village destination are illustrative and unverified. No maps/routing credentials are required; a paid routing service is not silently simulated. A future road-routing adapter can replace this estimate, but must preserve direction, time and capacity rules. Matching does not guarantee that a courier will accept or arrive.

Search normalizes Unicode NFKC and Hindi/English words, expands a small curated alias set, and queries precomputed tokens. `tractor bearing`, `bearing`, `बेयरिंग` and `tractor parts` find the tractor shop. Exact names and relevant keyword matches rank first. It does not perform fuzzy spelling correction, transliteration for every language, live inventory checks, or semantic AI search. No unsafe user regex is executed. Search results indicate likely shops, not guaranteed stock.

## Privacy and handover

Buyers, shop owners, a proposed/assigned partner, and authorized case reviewers have scoped order access. Unrelated accounts cannot read orders. Exact home coordinates and address are returned only to the buyer and currently committed partner; sellers/reviewers see village alone. Pickup/delivery codes never appear in ordinary order responses.

The seller receives the pickup code; buyer receives the delivery code. Only the assigned partner enters either. Six-digit random codes are distinct, hashed for validation, encrypted at rest with the stable server secret, expire six hours after the delivery deadline, and lock after five failures. Failed attempts persist even though the endpoint returns an error. A locked/expired code requires support review; there is no universal bypass. Changing the server secret invalidates encrypted codes and sessions, so maintain it securely across restarts.

Receipt verification only records custody. It does not complete payment or waive a complaint. The buyer can open a goods or delivery dispute before explicit completion. Disputes require already funded components; an unfunded request can instead be cancelled. The first pilot does not implement reopening a finalized settlement, so staff should resolve issues before final completion.

## Test commands and evidence

Run `npm run build --workspace backend` and `npx tsx --test backend/tests/commerce.test.ts` from the repository root. Tests cover search, direction/time/capacity, self-dealing, version invalidation, substitution consent, concurrent reservation, repeated payment, unauthorized actors, expiry, food preparation gates, code ownership/guess locking, component settlement, rematching, post-pickup incidents and local durability.

The Mongo smoke test is skipped unless a dedicated replica-set test database is supplied via `MONGO_TEST_URI`. This URI is test-only and backend-only. Use a disposable database; the smoke test initializes demo records if empty. Passing the local concurrency suite does not substitute for a live replica-set deployment test.

## Three-minute demo

1. Run the seed immediately before demonstrating so relative trip times are fresh. Sign in as buyer `9000000001` with the configured demo password, default `DemoPass123!`. Search `बेयरिंग` in Najibabad, open किसान ट्रैक्टर पार्ट्स, read the conversation, and open `order-bearing`.
2. Accept quote version 1. Find Ravi's compatible trip and propose ₹80. In a separate browser session sign in as partner `9000000003`, accept the offer; buyer confirms the fee and funds the demo ledger.
3. Sign in as seller `9000000002`. Upload a synthetic packaging photo and declare contents, then mark ready. Seller reads pickup code to partner; partner enters it. Buyer reads delivery code at arrival; partner enters it. Buyer completes and sees ₹1,200 allocated to seller plus ₹80 to partner.
4. For review, use `order-food`: accept, negotiate/fund, partner reconfirms readiness, seller starts preparing, then buyer cancels. Admin `9000000004` assigns resolver `9000000005`. Resolver records a written rationale and partial allocation. No courier is automatically charged the food bill.

All accounts, shopfronts, documents, products and route examples are synthetic. Each account can buy; role workspaces never require another registration.
