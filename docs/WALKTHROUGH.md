# Three-minute demo walkthrough

Start from a freshly seeded development store (`npm run seed`, with the API stopped, then `npm run dev`). Trips and quote windows are relative to the seed time. Use separate browser profiles for buyer, seller and delivery partner; tabs in one profile share a session. All phones and businesses below are synthetic. The default password is `DemoPass123!`.

This is a quick demonstration path through already proposed quotes. Creating a new quote from a shop discussion is also supported; the seed saves time when presenting the complete custody and payment journey.

| Time | Account and action | Expected result |
| --- | --- | --- |
| 0:00–0:30 | Buyer `9000000001`: open `/hi`, choose Najibabad and search `tractor bearing` or `बेयरिंग`. Open किसान ट्रैक्टर पार्ट्स, then Messages. | The same shop is found through bilingual aliases without an SKU catalogue. The conversation is private and keeps the original Hindi messages. |
| 0:30–1:00 | Open the ordinary bearing order. Review and accept the current ₹1,200 quote, then choose Ravi's compatible Raipur trip and propose ₹60 delivery. In the partner profile (`9000000003`), accept or counteroffer the fee. | The buyer sees the structured final fee separately from goods. A chat message alone does not book delivery or change its price. |
| 1:00–1:30 | Buyer confirms the final fee and funds the DEMO ledger. Seller `9000000002` opens the order, adds a synthetic packaging image and contents, and marks it ready. | Capacity is reserved atomically; DEMO funds show ₹1,200 goods + ₹60 delivery + ₹0 platform. No real money moves. The seller sees the pickup code; the partner does not receive it from the API. |
| 1:30–2:00 | Partner enters the seller's pickup code at handover, then the buyer's different delivery code on arrival. Buyer completes the order after checking the parcel. | Custody timestamps progress through pickup and delivery. The demo ledger releases ₹1,200 to the seller and ₹60 to the partner once; the completed order moves to the archive. Code verification does not waive complaints about damaged or incorrect goods. |
| 2:00–2:35 | On the seeded food order, repeat quote/fee/funding with a compatible trip. Partner reconfirms readiness; seller starts preparation. Buyer requests cancellation with a reason. | Food preparation requires funded terms, a committed delivery partner and recent readiness confirmation. Cancellation after preparation creates a dispute; no full-food-bill penalty is automatically charged to the partner. |
| 2:35–3:00 | Admin `9000000004` assigns that case to resolver `resolver`. Resolver `9000000005` reviews responsibility and records an example allocation and written rationale. | For a ₹400 goods + ₹60 delivery demo, an illustrative ₹200 seller / ₹0 partner allocation refunds ₹260 to the buyer. This is a deliberate review decision, not a default policy. The ledger records one partial settlement and its rationale. |

Use a synthetic PNG/WebP such as a generated brand proof for the packaging demonstration, not a real identity document. In a real flow the seller must supply a truthful packaging photo and contents. For a damaged-goods dispute affecting only goods, a correctly earned delivery component is protected from reduction.

## Additional acceptance checks

- Before pickup, have Ravi cancel an ordinary delivery. The goods agreement stays available, capacity is released, the prior delivery component is refunded, and buyer-approved replacement terms are required. Mohan (`9000000008`) has a seeded alternative trip. Cancellation after pickup becomes an incident/recovery review instead of an ordinary unassigned order.
- Try signing in as the pending partner (`9000000006`) or unrelated buyer (`9000000007`). Server authorization rejects unauthorized booking, order, chat and document access. Hiding a UI button is not the permission boundary.
- Switch Hindi/English on each main screen; the route and remembered language follow the choice. Enable large text in Profile and check the mobile layout. Messages written by users remain in their original language.
- Reset the seed before testing stale trip windows. Automated tests cover concurrent over-capacity booking, repeat funding/settlement, quote-version invalidation, code attempt lockout and related edge cases.
- Audio/video needs two independent sessions, HTTPS (localhost is suitable for local browser permissions), and a reachable configured TURN server. Without TURN, the UI honestly offers chat. A complete live cross-network call requires the owner's TURN credentials and was not simulated as success.
