import type { InfraState } from "../infra-types.js";
import type { Address } from "../location.js";
import type {LocationResolution} from '../geocoding.js';
export type Localized = { hi: string; en: string };
export type Point = { lat: number; lng: number };
export type User = {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
  roles: string[];
  partnerStatus: "none" | "pending" | "approved" | "rejected";
  [key: string]: any;
};
export type Shop = {
  id: string;
  slug: string;
  sellerId: string;
  name: Localized;
  ownerName: string;
  category: string;
  description: Localized;
  keywords: string[];
  town: string;
  locality: Localized;
  address: string;
  coordinates?: Point | null;
  locationResolution?: LocationResolution;
  addressDetails?: Address;
  locationVerified?: boolean;
  suspended?: boolean;
  hours: string;
  image: string;
  gallery: string[];
  items: Localized[];
  approved: boolean;
  closed: boolean;
  reviewReason?: string;
  contactPreferences: string[];
  searchTokens: string[];
  createdAt: string;
  updatedAt: string;
};
export type Trip = {
  id: string;
  partnerId: string;
  partnerName: string;
  origin: string;
  destination: string;
  route: Point[];
  departureAt: string;
  arrivalAt: string;
  pickupFlexMinutes?: number | null;
  originAddress?: Address;
  destinationAddress?: Address;
  originResolution?: LocationResolution;
  destinationResolution?: LocationResolution;
  locationVerified?: boolean;
  transport: "bicycle" | "motorcycle" | "car" | "van";
  // Legacy limits are retained for stored trips but no longer restrict matching.
  capacityGrams?: number | null;
  reservedGrams: number;
  capacityParcels?: number | null;
  reservedParcels: number;
  maxParcelSize?: "small" | "medium" | null;
  maxDetourKm?: number | null;
  categories: string[];
  available: boolean;
  createdAt: string;
};
export type QuoteItem = {
  description: string;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
};
export type Quote = {
  version: number;
  items: QuoteItem[];
  goodsTotalPaise: number;
  substitutions: string;
  substitutionConsentRequired: boolean;
  weightGrams: number;
  size: "small" | "medium";
  pickup?: Point | null;
  pickupAddress: string;
  pickupAddressDetails?: Address;
  pickupResolution?: LocationResolution;
  preparationMinutes: number;
  readyAt: string;
  pickupBy: string;
  deliveryBy: string;
  category: string;
  perishable: boolean;
  cancellationTerms: string;
  expiresAt: string;
  createdAt: string;
};
export type Offer = {
  id: string;
  tripId: string;
  partnerId: string;
  proposedPaise: number;
  finalPaise: number;
  status:
    | "proposed"
    | "countered"
    | "accepted_by_partner"
    | "confirmed"
    | "declined"
    | "expired";
  quoteVersion: number;
  expiresAt: string;
  createdAt: string;
};
export type Assignment = {
  id: string;
  tripId: string;
  partnerId: string;
  feePaise: number;
  state:
    | "reserved"
    | "committed"
    | "picked_up"
    | "delivered"
    | "cancelled"
    | "incident";
  reservedUntil: string;
  capacityReleased: boolean;
  readinessConfirmedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
};
export type OrderStatus =
  | "awaiting_quote"
  | "quote_proposed"
  | "awaiting_delivery_partner"
  | "delivery_reserved"
  | "confirmed"
  | "preparing"
  | "ready"
  | "picked_up"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed";
export type CodeRecord = {
  hash: string;
  ciphertext: string;
  expiresAt: string;
  attempts: number;
  consumedAt?: string;
};
export type LedgerEvent = {
  id: string;
  key: string;
  type: "fund" | "release" | "refund" | "partial_settlement";
  goodsPaise: number;
  deliveryPaise: number;
  platformPaise: number;
  sellerPaise: number;
  partnerPaise: number;
  buyerRefundPaise: number;
  at: string;
};
export type Payment = {
  mode: "demo";
  state: "unfunded" | "funded" | "settled" | "refunded";
  goodsPaise: number;
  deliveryPaise: number;
  platformPaise: number;
  ledger: LedgerEvent[];
};
export type Dispute = {
  id: string;
  openedBy: string;
  reason: string;
  description?: string;
  openedAt?: string;
  components: ("goods" | "delivery")[];
  evidence: string[];
  responses: { userId: string; text: string; at: string; evidence?: string[] }[];
  responseDeadline: string;
  resolverId?: string;
  status: "open" | "awaiting_response" | "under_review" | "decided" | "closed" | "resolved";
  decision?: {
    sellerPaise: number;
    partnerPaise: number;
    buyerRefundPaise: number;
    rationale: string;
    at: string;
    outcome?: "full_refund" | "full_release" | "partial_split";
    instructionId?: string;
  };
};
export type Activity = {
  id: string;
  type: string;
  actorId: string;
  at: string;
  detail?: string;
};
export type Order = {
  id: string;
  buyerId: string;
  sellerId: string;
  shopId: string;
  shopName: Localized;
  destination: Partial<Point> & { village: string; address: string; addressDetails?: Address; locationVerified?: boolean; locationResolution?: LocationResolution };
  matchingPickup?: {quoteVersion:number;coordinates:Point|null;resolution?:LocationResolution};
  status: OrderStatus;
  quotes: Quote[];
  acceptedQuote?: Quote;
  acceptedAt?: string;
  offers: Offer[];
  assignment?: Assignment;
  assignmentHistory: Assignment[];
  payment: Payment;
  dispute?: Dispute;
  pickupCode?: CodeRecord;
  deliveryCode?: CodeRecord;
  packaging?: { imageId: string; contents: string; at: string };
  activity: Activity[];
  idempotency: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};
export type AuxiliaryRecord = { id: string; [key: string]: any };
export type State = InfraState & {
  users: User[];
  shops: Shop[];
  trips: Trip[];
  orders: Order[];
  audit: AuxiliaryRecord[];
};
export type Store = {
  read<T>(fn: (state: State) => T | Promise<T>, scope?: (keyof State)[]): Promise<T>;
  transaction<T>(fn: (state: State) => T | Promise<T>, scope?: (keyof State)[]): Promise<T>;
  searchShops(query: {
    town?: string;
    category?: string;
    q?: string;
    page?: number;
    limit?: number;
  }): Promise<{ shops: Shop[]; total: number; page: number; pages: number; towns: string[] }>;
  close(): Promise<void>;
  ready(): boolean;
};
