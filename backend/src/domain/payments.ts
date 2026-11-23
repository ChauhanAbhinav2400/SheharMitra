import type { LedgerEvent } from './types.js';
import { ensure } from './errors.js';

// Provider contracts deliberately separate amounts; no card/bank credentials or
// pretend blockchain transaction IDs are accepted by the demo implementation.
export interface PaymentProvider {
  readonly mode: 'demo';
  validateEvent(event: Omit<LedgerEvent, 'id' | 'at'>): void;
}
export class DemoPaymentProvider implements PaymentProvider {
  readonly mode = 'demo' as const;
  validateEvent(event: Omit<LedgerEvent, 'id' | 'at'>) {
    for (const amount of [event.goodsPaise, event.deliveryPaise, event.platformPaise, event.sellerPaise, event.partnerPaise, event.buyerRefundPaise]) ensure(Number.isSafeInteger(amount) && amount >= 0, 'invalid_money');
    ensure(event.sellerPaise <= event.goodsPaise && event.partnerPaise <= event.deliveryPaise, 'invalid_allocation');
    if (event.type !== 'fund') ensure(event.sellerPaise + event.partnerPaise + event.buyerRefundPaise <= event.goodsPaise + event.deliveryPaise + event.platformPaise, 'unbalanced_ledger');
  }
}
