import type { Shop } from './types.js';

export function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-IN').replace(/[^\p{L}\p{N}\p{M}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}
const aliases: Record<string, string[]> = {
  bearing: ['bearing', 'बेयरिंग', 'tractor', 'parts', 'ट्रैक्टर'],
  बेयरिंग: ['bearing', 'बेयरिंग', 'tractor', 'parts', 'ट्रैक्टर'],
  tractor: ['tractor', 'ट्रैक्टर', 'bearing', 'parts'],
  ट्रैक्टर: ['tractor', 'ट्रैक्टर', 'bearing', 'parts'],
  kirana: ['kirana', 'household', 'किराना', 'grocery'],
  किराना: ['kirana', 'household', 'किराना', 'grocery'],
  notebook: ['notebook', 'stationery', 'कॉपी', 'किताब'],
  कपड़े: ['clothing', 'कपड़े', 'कपड़ा'],
};
export function tokens(value: string): string[] {
  const words = normalize(value).split(' ').filter(Boolean);
  return [...new Set(words.flatMap(w => aliases[w] || [w]))];
}
export function shopTokens(shop: Pick<Shop, 'name' | 'ownerName' | 'keywords' | 'category' | 'description'>): string[] {
  return tokens([shop.name.en, shop.name.hi, shop.ownerName, shop.category, shop.description.en, shop.description.hi, ...shop.keywords].join(' '));
}
export function rankShop(shop: Shop, query: string): number {
  const n = normalize(query);
  if (!n) return 0;
  return (normalize(shop.name.en) === n || normalize(shop.name.hi) === n ? 100 : 0)
    + (normalize(shop.name.en).includes(n) || normalize(shop.name.hi).includes(n) ? 30 : 0)
    + tokens(query).filter(t => shop.searchTokens.includes(t)).length * 5;
}
