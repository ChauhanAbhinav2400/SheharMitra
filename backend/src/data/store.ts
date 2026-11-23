import {queueChanges} from '../notification-events.js';
import mongoose, { Schema } from "mongoose";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { State, Store, Shop } from "../domain/types.js";
export type { Store } from "../domain/types.js";
import { rankShop, tokens } from "../domain/search.js";

export const collections: (keyof State)[] = [
  "settlementInstructions",
  "notifications",
  "pushDevices",
  "calls",
  "locations",
  "users",
  "shops",
  "trips",
  "orders",
  "conversations",
  "messages",
  "uploads",
  "verifications",
  "sessions",
  "otps",
  "audit",
  "infraAudit",
];
export function emptyState(): State {
  return Object.fromEntries(
    collections.map((k) => [k, []]),
  ) as unknown as State;
}
const clone = <T>(x: T): T => structuredClone(x);
export class LocalStore implements Store {
  private state: State;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    state: State,
    private file?: string,
  ) {
    this.state = clone({...emptyState(),...state});
  }
  static async open(file: string, initial: () => Promise<State>) {
    let state: State;
    try {
      state = { ...emptyState(), ...JSON.parse(await readFile(file, "utf8")) };
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      state = await initial();
    }
    const store = new LocalStore(state, file);
    await store.transaction(() => undefined);
    return store;
  }
  async read<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
    await this.queue;
    return clone(await fn(clone(this.state)));
  }
  transaction<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      const next = clone(this.state);
      const value = await fn(next);
      queueChanges(this.state,next);
      if (this.file) {
        await mkdir(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        await writeFile(temporary, JSON.stringify(next), {
          encoding: "utf8",
          mode: 0o600,
        });
        await rename(temporary, this.file);
      }
      this.state = next;
      return clone(value);
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  async searchShops(query: Parameters<Store["searchShops"]>[0]) {
    const page = query.page || 1,
      limit = query.limit || 12;
    return this.read((state) => {
      const wanted = tokens(query.q || "");
      const visible = state.shops.filter(s=>s.approved && !s.suspended && !state.users.some(u=>u.id===s.sellerId&&(u.banned||u.roles.some(r=>['admin','resolver','dispute_resolver'].includes(r)))));
      const towns = [...new Set(visible.map(s=>s.town).filter(Boolean))].sort();
      const found = visible
        .filter(
          (s) =>
            (!query.town || s.town === query.town) &&
            (!query.category || s.category === query.category) &&
            (!wanted.length || wanted.some((t) => s.searchTokens.includes(t))),
        )
        .sort(
          (a, b) =>
            rankShop(b, query.q || "") - rankShop(a, query.q || "") ||
            a.slug.localeCompare(b.slug),
        );
      return {
        towns,
        shops: found.slice((page - 1) * limit, page * limit),
        total: found.length,
        page,
        pages: Math.ceil(found.length / limit),
      };
    });
  }
  ready() {
    return true;
  }
  async close() {
    await this.queue;
  }
}

// Entity documents remain separate, allowing indexes and incremental writes. The pilot
// unit-of-work is bounded to 10,000 records per collection; scale-specific repositories
// should replace broad administrative snapshots before growing beyond that boundary.
export class MongoStore implements Store {
  private models: Record<string, mongoose.Model<any>> = {};
  private revision: mongoose.Model<any>;
  constructor() {
    for (const collection of collections) {
      const schema = new Schema(
        { id: { type: String, required: true, unique: true } },
        {
          strict: false,
          // Empty domain maps (for example conversation readAt) must survive
          // persistence just as they do in the local adapter.
          minimize: false,
          versionKey: false,
          collection: `sheharmitra_${collection}`,
        },
      );
      if (collection === "users") schema.index({ phone: 1 }, { unique: true });
      if (collection === "shops") {
        schema.index({ town: 1, approved: 1, category: 1 });
        schema.index({ town: 1, approved: 1, searchTokens: 1 });
        schema.index({ slug: 1 }, { unique: true });
      }
      if (collection === "trips")
        schema.index({ available: 1, departureAt: 1, partnerId: 1 });
      if (collection === "orders") {
        schema.index({ buyerId: 1, status: 1 });
        schema.index({ sellerId: 1, status: 1 });
        schema.index({ "assignment.partnerId": 1, status: 1 });
      }
      if (collection === "conversations") schema.index({ members: 1 });
      if (collection === "messages") {
        schema.index({ conversationId: 1, createdAt: -1 });
        schema.index(
          { conversationId: 1, senderId: 1, clientId: 1 },
          { unique: true },
        );
      }
      if (collection === "sessions") {
        schema.index({ tokenHash: 1 });
        schema.index({ expiresAt: 1 });
      }
      if (collection === "otps") schema.index({ phone: 1, expiresAt: 1 });
      if (collection === "uploads") schema.index({ ownerId: 1, purpose: 1 });
      this.models[collection] =
        mongoose.models[`SheharMitra_${collection}`] ||
        mongoose.model(`SheharMitra_${collection}`, schema);
    }
    this.revision =
      mongoose.models.SheharMitra_revision ||
      mongoose.model(
        "SheharMitra_revision",
        new Schema(
          { name: { type: String, unique: true }, version: Number },
          { collection: "sheharmitra_revision" },
        ),
      );
  }
  static async open(uri: string, initial?: () => Promise<State>) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const store = new MongoStore();
    await Promise.all(Object.values(store.models).map((m) => m.init()));
    await store.revision.updateOne(
      { name: "unit-of-work" },
      { $setOnInsert: { version: 0 } },
      { upsert: true },
    );
    if (initial && (await store.models.users.countDocuments()) === 0)
      await store.transaction(async (s) => Object.assign(s, await initial()));
    return store;
  }
  private async snapshot(session?: mongoose.ClientSession, scope = collections): Promise<State> {
    const readCollection = async (key: keyof State) => {
      const query = this.models[key].find({}, { _id: 0 }).limit(10001).lean();
      if (session) query.session(session);
      const rows = await query;
      if (rows.length > 10000)
        throw new Error(
          "Pilot data limit reached. Migrate to paginated repositories before accepting more records.",
        );
      return [key, rows];
    };
    const entries: any[] = [];
    if (session) {
      for (const key of scope) entries.push(await readCollection(key));
    } else
      entries.push(...(await Promise.all(scope.map(readCollection))));
    return {...emptyState(), ...Object.fromEntries(entries)} as State;
  }
  async read<T>(fn: (state: State) => T | Promise<T>, scope = collections): Promise<T> {
    return clone(await fn(await this.snapshot(undefined, scope)));
  }
  async transaction<T>(fn: (state: State) => T | Promise<T>, scope = collections): Promise<T> {
    // Notification hooks need users and conversations when messages are written.
    scope = [...new Set([...scope, "users", "notifications", ...(scope.includes("messages") ? ["conversations" as const] : [])])] as (keyof State)[];
    let result!: T;
    await mongoose.connection.transaction(async (session) => {
      // Serializes competing capacity/settlement mutations across Node processes.
      // A write conflict retries the whole callback against a fresh transaction snapshot.
      await this.revision.updateOne(
        { name: "unit-of-work" },
        { $inc: { version: 1 } },
        { session },
      );
      const before = await this.snapshot(session, scope),
        after = clone(before);
      result = await fn(after);
      queueChanges(before,after);
      for (const key of scope) {
        const old = new Map(
          (before[key] as { id: string }[]).map((x) => [
            x.id,
            JSON.stringify(x),
          ]),
        );
        const next = after[key] as { id: string }[];
        const ids = new Set(next.map((x) => x.id));
        const operations: any[] = next
          .filter((x) => old.get(x.id) !== JSON.stringify(x))
          .map((x) => ({
            replaceOne: { filter: { id: x.id }, replacement: x, upsert: true },
          }));
        for (const id of old.keys())
          if (!ids.has(id)) operations.push({ deleteOne: { filter: { id } } });
        if (operations.length)
          await this.models[key].bulkWrite(operations, { session });
      }
    });
    return clone(result);
  }
  async searchShops(query: Parameters<Store["searchShops"]>[0]) {
    const page = query.page || 1,
      limit = query.limit || 12,
      wanted = tokens(query.q || "");
    const restricted=await this.models.users.find({$or:[{banned:true},{roles:{$in:['admin','resolver','dispute_resolver']}}]},{id:1}).lean();
    const visibilityFilter = { approved: true, suspended: {$ne:true}, sellerId:{$nin:restricted.map(u=>u.id)} };
    // Town choices cover all visible shops, not just the current search page.
    const towns = (await this.models.shops.distinct('town',visibilityFilter) as string[]).filter(Boolean).sort();
    const filter: Record<string, unknown> = { ...visibilityFilter };
    if (query.town) filter.town = query.town;
    if (query.category) filter.category = query.category;
    if (wanted.length) filter.searchTokens = { $in: wanted };
    const total = await this.models.shops.countDocuments(filter);
    const normalized = (query.q || "").normalize("NFKC").toLowerCase();
    const shops = (await this.models.shops.aggregate([
      { $match: filter },
      {
        $addFields: {
          _score: {
            $add: [
              {
                $cond: [
                  {
                    $or: [
                      { $eq: [{ $toLower: "$name.en" }, normalized] },
                      { $eq: ["$name.hi", normalized] },
                    ],
                  },
                  100,
                  0,
                ],
              },
              {
                $multiply: [
                  { $size: { $setIntersection: ["$searchTokens", wanted] } },
                  5,
                ],
              },
            ],
          },
        },
      },
      { $sort: { _score: -1, slug: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { _id: 0, _score: 0 } },
    ])) as Shop[];
    return { shops, total, page, pages: Math.ceil(total / limit), towns };
  }
  ready() {
    return mongoose.connection.readyState === 1;
  }
  async close() {
    await mongoose.disconnect();
  }
}
export async function createStore(
  options: { database: string; mongoUri?: string; dataFile: string },
  initial: () => Promise<State>,
): Promise<Store> {
  // A real database must never be reset merely because its users collection is empty.
  // Explicit demo seed commands perform their own guarded transaction.
  return options.database === "mongo"
    ? MongoStore.open(options.mongoUri || "")
    : LocalStore.open(options.dataFile, initial);
}
