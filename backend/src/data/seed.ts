import { hash } from 'bcryptjs';
import type { State, Shop, Quote, Order } from '../domain/types.js';
import { emptyState } from './store.js';
import { shopTokens } from '../domain/search.js';

const loc = (hi: string, en: string) => ({ hi, en });
export async function seedState(password = 'DemoPass123!'): Promise<State> {
  const state = emptyState(), passwordHash = await hash(password, 12), now = new Date().toISOString();
  state.users = [
    { id: 'buyer', name: 'सीमा देवी / Seema', phone: '9000000001', passwordHash, roles: ['buyer'], partnerStatus: 'none' },
    { id: 'seller', name: 'अमित कुमार / Amit', phone: '9000000002', passwordHash, roles: ['buyer', 'seller'], partnerStatus: 'none' },
    { id: 'partner', name: 'रवि कुमार / Ravi', phone: '9000000003', passwordHash, roles: ['buyer', 'delivery_partner'], partnerStatus: 'approved' },
    { id: 'admin', name: 'Demo reviewer', phone: '9000000004', passwordHash, roles: ['buyer', 'admin'], partnerStatus: 'none' },
    { id: 'resolver', name: 'Demo resolver', phone: '9000000005', passwordHash, roles: ['buyer', 'resolver'], partnerStatus: 'none' },
    { id: 'unapproved', name: 'Pending partner', phone: '9000000006', passwordHash, roles: ['buyer'], partnerStatus: 'pending' },
    { id: 'buyer2', name: 'अनिता / Anita', phone: '9000000007', passwordHash, roles: ['buyer'], partnerStatus: 'none' },
    { id: 'partner2', name: 'मोहन / Mohan', phone: '9000000008', passwordHash, roles: ['buyer', 'delivery_partner'], partnerStatus: 'approved' },
  ];
  const entries = [
    ['tractor-parts', 'kisan-tractor-parts', 'किसान ट्रैक्टर पार्ट्स', 'Kisan Tractor Parts', 'ट्रैक्टर के छोटे पुर्ज़े और बेयरिंग। सही आकार के लिए दुकान से बात करें।', 'Small tractor parts and bearings. Ask the shop about the right size.', 'बेयरिंग bearing tractor parts ट्रैक्टर', 'बेयरिंग', 'Bearings'],
    ['household', 'apna-kirana', 'अपना किराना', 'Apna Kirana', 'घर की ज़रूरत का राशन और सफ़ाई का सामान।', 'Everyday household essentials and cleaning supplies.', 'kirana किराना household soap rice', 'घरेलू सामान', 'Household essentials'],
    ['stationery', 'vidya-stationery', 'विद्या स्टेशनरी', 'Vidya Stationery', 'स्कूल की कॉपी, पेन और पढ़ाई का सामान।', 'Notebooks, pens and school supplies.', 'stationery notebook pen कॉपी पेन', 'कॉपी और पेन', 'Notebooks and pens'],
    ['clothing', 'rangoli-vastra', 'रंगोली वस्त्र', 'Rangoli Vastra', 'रोज़मर्रा के कपड़े और सूती कपड़ा। रंग और नाप पहले पूछें।', 'Everyday clothing and cotton fabric. Confirm size and colour first.', 'clothing कपड़े कपड़ा cotton', 'सूती कपड़ा', 'Cotton fabric'],
    ['food', 'madhur-mithai', 'मधुर मिठाई भंडार', 'Madhur Mithai Bhandar', 'ताज़ा नाश्ता और मिठाई। यह समय पर तैयार होने वाला डेमो ऑर्डर है।', 'Fresh snacks and sweets. Preparation needs a confirmed delivery partner.', 'food sweets मिठाई नाश्ता', 'मिठाई का डिब्बा', 'Box of sweets'],
    ['hardware', 'vishwas-hardware', 'विश्वास हार्डवेयर', 'Vishwas Hardware', 'घर के छोटे औज़ार, नट और बोल्ट।', 'Small hand tools, nuts and bolts for home repairs.', 'hardware tools औज़ार nuts bolts', 'छोटे औज़ार', 'Small hand tools'],
    ['electricals', 'roshni-electricals', 'रोशनी इलेक्ट्रिकल्स', 'Roshni Electricals', 'एलईडी बल्ब और घर के छोटे बिजली के सामान।', 'LED bulbs and small home electrical accessories.', 'electricals bulbs बल्ब बिजली', 'एलईडी बल्ब', 'LED bulbs'],
    ['utensils', 'grihalakshmi-bartan', 'गृहलक्ष्मी बर्तन', 'Grihalakshmi Bartan', 'रसोई के स्टील बर्तन, डिब्बे और चम्मच।', 'Steel utensils, containers and spoons for your kitchen.', 'utensils बर्तन kitchen steel', 'स्टील के बर्तन', 'Steel utensils'],
  ];
  state.shops = entries.map((e, i) => {
    const shop: Shop = { id: `shop-${e[0]}`, slug: e[1], sellerId: 'seller', name: loc(e[2], e[3]), ownerName: 'अमित कुमार / Amit Kumar', category: e[0], description: loc(e[4], e[5]), keywords: e[6].split(' '), town: 'najibabad', locality: loc(i % 2 ? 'मुख्य बाज़ार' : 'स्टेशन रोड', i % 2 ? 'Main Bazaar' : 'Station Road'), address: `${i + 1}, Demo Bazaar, Najibabad, Bijnor, Uttar Pradesh`, coordinates: { lat: 29.611 + i * 0.00012, lng: 78.344 + i * 0.00012 }, hours: '09:00–19:00 (demo)', image: `/shops/${e[0]}.svg`, gallery: [], items: [loc(e[7], e[8])], approved: true, closed: i === 6, contactPreferences: ['message', 'audio', 'video'], searchTokens: [], createdAt: now, updatedAt: now };
    shop.searchTokens = shopTokens(shop); return shop;
  });
  const time = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();
  const route = [{ lat: 29.610, lng: 78.343 }, { lat: 29.620, lng: 78.350 }, { lat: 29.637, lng: 78.363 }, { lat: 29.658, lng: 78.379 }];
  const baseTrip = { origin: 'Najibabad', destination: 'Raipur (illustrative)', route, departureAt: time(40), arrivalAt: time(80), pickupFlexMinutes: 15, transport: 'motorcycle' as const, capacityGrams: 5000, reservedGrams: 0, capacityParcels: 3, reservedParcels: 0, maxParcelSize: 'medium' as const, maxDetourKm: 3, categories: entries.map(e => e[0]), available: true, createdAt: now };
  state.trips = [
    { ...baseTrip, id: 'trip-raipur', partnerId: 'partner', partnerName: 'रवि कुमार / Ravi' },
    { ...baseTrip, id: 'trip-raipur-replacement', partnerId: 'partner2', partnerName: 'मोहन / Mohan', departureAt: time(45), arrivalAt: time(85), capacityGrams: 8000 },
    { ...baseTrip, id: 'trip-wrong-direction', partnerId: 'partner2', partnerName: 'मोहन / Mohan', origin: 'Raipur (illustrative)', destination: 'Najibabad', route: [...route].reverse() },
    { ...baseTrip, id: 'trip-expired', partnerId: 'partner', partnerName: 'रवि कुमार / Ravi', departureAt: time(-120), arrivalAt: time(-60) },
    { ...baseTrip, id: 'trip-unapproved', partnerId: 'unapproved', partnerName: 'Pending partner' },
  ];
  const quote = (perishable: boolean): Quote => ({ version: 1, items: [{ description: perishable ? 'मिठाई का डिब्बा / Box of sweets' : 'ट्रैक्टर बेयरिंग / Tractor bearing', quantity: 1, unitPricePaise: perishable ? 40000 : 120000, lineTotalPaise: perishable ? 40000 : 120000 }], goodsTotalPaise: perishable ? 40000 : 120000, substitutions: '', substitutionConsentRequired: false, weightGrams: perishable ? 1000 : 2000, size: 'small', pickup: { lat: 29.611, lng: 78.344 }, pickupAddress: 'Demo Bazaar, Najibabad', preparationMinutes: perishable ? 10 : 0, readyAt: time(perishable ? 35 : 20), pickupBy: time(65), deliveryBy: time(110), category: perishable ? 'food' : 'tractor-parts', perishable, cancellationTerms: 'Preparation has not started: full demo refund. After preparation: responsibility is reviewed; no automatic penalty. Buyer unavailable: contact twice, wait 15 minutes, then agree a return with support. / तैयारी शुरू होने से पहले पूरा डेमो रिफंड। बाद में ज़िम्मेदारी की समीक्षा होगी।', expiresAt: time(60), createdAt: now });
  function order(perishable: boolean): Order {
    const shop = state.shops.find(s => s.category === (perishable ? 'food' : 'tractor-parts'))!;
    return { id: perishable ? 'order-food' : 'order-bearing', buyerId: 'buyer', sellerId: 'seller', shopId: shop.id, shopName: shop.name, destination: { village: 'Raipur (illustrative)', address: 'Demo village meeting point', lat: 29.653, lng: 78.375 }, status: 'quote_proposed', quotes: [quote(perishable)], offers: [], assignmentHistory: [], payment: { mode: 'demo', state: 'unfunded', goodsPaise: 0, deliveryPaise: 0, platformPaise: 0, ledger: [] }, activity: [{ id: `event-seed-${perishable}`, type: 'quote_proposed', actorId: 'seller', at: now, detail: '1' }], idempotency: {}, createdAt: now, updatedAt: now };
  }
  state.orders = [order(false), order(true)];
  state.conversations = [{ id: 'chat-bearing', members: ['buyer', 'seller'], shopId: 'shop-tractor-parts', orderId: 'order-bearing', createdAt: now, readAt: {} }];
  state.messages = [{ id: 'message-demo-1', conversationId: 'chat-bearing', senderId: 'buyer', text: 'नमस्ते, क्या ट्रैक्टर के लिए बेयरिंग मिलेगा?', createdAt: now, clientId: 'seed-message-1' }, { id: 'message-demo-2', conversationId: 'chat-bearing', senderId: 'seller', text: 'नमस्ते! नाप मिलाकर देख लेते हैं। मैंने एक डेमो कोटेशन भेजा है।', createdAt: now, clientId: 'seed-message-2' }];
  return state;
}
