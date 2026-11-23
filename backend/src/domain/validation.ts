import { z } from 'zod';
import {addressSchema,locationResolutionSchema} from '../location.js';
export const categories = ['tractor-parts', 'household', 'stationery', 'clothing', 'food', 'hardware', 'electricals', 'utensils'] as const;
export const pointSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const date = z.string().datetime({ offset: true });
export const quoteSchema = z.object({
  items: z.array(z.object({ description: z.string().trim().min(1).max(180), quantity: z.number().int().positive().max(100), unitPricePaise: z.number().int().nonnegative().max(5000000) })).min(1).max(20),
  substitutions: z.string().trim().max(500).default(''), substitutionConsentRequired: z.boolean().default(false),
  weightGrams: z.number().int().positive().max(20000), size: z.enum(['small', 'medium']), pickup: pointSchema.nullable().optional(), pickupAddress: z.string().min(3).max(1000), pickupAddressDetails:addressSchema.optional(), pickupResolution:locationResolutionSchema.optional(),
  preparationMinutes: z.number().int().min(0).max(240), readyAt: date, pickupBy: date, deliveryBy: date,
  category: z.enum(categories), perishable: z.boolean(), cancellationTerms: z.string().trim().min(10).max(1000), expiresAt: date,
}).superRefine((v, ctx) => {
  if (Date.parse(v.readyAt) >= Date.parse(v.pickupBy) || Date.parse(v.pickupBy) >= Date.parse(v.deliveryBy)) ctx.addIssue({ code: 'custom', message: 'invalid_time_window' });
  if (v.perishable && v.category !== 'food') ctx.addIssue({ code: 'custom', message: 'invalid_category' });
  if (v.category === 'food' && !v.perishable) ctx.addIssue({ code: 'custom', message: 'food_must_be_perishable' });
});
export const tripSchema = z.object({ origin: z.string().trim().min(2).max(80), destination: z.string().trim().min(2).max(80), route: z.array(pointSchema).max(40).default([]), originAddress:addressSchema.optional(), destinationAddress:addressSchema.optional(), originResolution:locationResolutionSchema.optional(), destinationResolution:locationResolutionSchema.optional(), locationVerified:z.boolean().optional(), departureAt: date, arrivalAt: date, transport: z.enum(['bicycle', 'motorcycle', 'car', 'van']), categories: z.array(z.enum(categories)).min(1).max(8) }).strict();
const localized = z.object({ hi: z.string().trim().min(2).max(600), en: z.string().trim().min(2).max(600) });
export const shopSchema = z.object({ name: localized, ownerName: z.string().trim().min(2).max(80), category: z.enum(categories), description: localized, keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(30), town: z.string().trim().min(2).max(100), locality: localized, address: z.string().trim().min(5).max(1000), coordinates: pointSchema.nullable().optional(), locationResolution:locationResolutionSchema.optional(), addressDetails:addressSchema.optional(), locationVerified:z.boolean().optional(), hours: z.string().max(150), image: z.string().min(1).max(300), gallery: z.array(z.string().max(300)).max(4).default([]), items: z.array(localized).max(8).default([]), contactPreferences: z.array(z.enum(['message', 'audio', 'video'])).min(1).default(['message']), closed: z.boolean().default(false) });
