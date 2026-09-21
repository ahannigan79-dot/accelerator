/**
 * Persistent Factory data layer.
 * - PostgresStore when POSTGRES_URL is set (Vercel Postgres / any Postgres).
 * - FileStore otherwise (JSON files under data/engagements; dev only).
 * Both persist State and Runtime together and reject writes whose base revision is stale.
 */

import fs from "node:fs";
import path from "node:path";
import type { FactoryState, RuntimeContext, HistoryEvent } from "./schema";

export interface EngagementRecord {
  state: FactoryState;
  runtime: RuntimeContext;
}

export interface EngagementListItem {
  engagementId: string;
  clientName: string;
  engagementName: string;
  workflowName: string;
  currentStage: string;
  stateRevision: number;
  updatedAt: string;
  nextAction: string;
  blockers: number;
  pendingDecisions: number;
}

export class StaleWriteError extends Error {
  constructor(public expected: number, public actual: number) {
    super(`Stale write: expected base revision ${expected}, store has ${actual}`);
  }
}

export interface Store {
  list(): Promise<EngagementListItem[]>;
  get(engagementId: string): Promise<EngagementRecord | null>;
  /** Persist state+runtime. `baseRevision` is the revision the caller read; the store rejects if it moved. */
  put(rec: EngagementRecord, baseRevision: number | null): Promise<void>;
  appendEvents(engagementId: string, events: HistoryEvent[]): Promise<void>;
  events(limit?: number): Promise<(HistoryEvent & { engagementId: string })[]>;
}

function toListItem(r: EngagementRecord): EngagementListItem {
  return {
    engagementId: r.state.engagement_id,
    clientName: r.state.engagementSetup.clientName,
    engagementName: r.state.engagementSetup.engagementName,
    workflowName: r.state.engagementSetup.workflowName,
    currentStage: r.state.currentStage,
    stateRevision: r.state.stateRevision,
    updatedAt: r.state.stateUpdatedAt,
    nextAction: r.runtime.nextHumanAction.title,
    blockers: r.runtime.blockers.length,
    pendingDecisions: r.runtime.pendingDecisionCount,
  };
}

// ---------------------------------------------------------------------------
// File store
// ---------------------------------------------------------------------------

export class FileStore implements Store {
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }
  private file(id: string) {
    return path.join(this.dir, `${id.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
  }
  async list(): Promise<EngagementListItem[]> {
    const out: EngagementListItem[] = [];
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith(".json") || f.endsWith(".events.json")) continue;
      try {
        out.push(toListItem(JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8"))));
      } catch {
        /* skip unreadable */
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string): Promise<EngagementRecord | null> {
    const f = this.file(id);
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, "utf8")) as EngagementRecord;
  }
  async put(rec: EngagementRecord, baseRevision: number | null): Promise<void> {
    const existing = await this.get(rec.state.engagement_id);
    if (existing && baseRevision !== null && existing.state.stateRevision !== baseRevision) throw new StaleWriteError(baseRevision, existing.state.stateRevision);
    const f = this.file(rec.state.engagement_id);
    const tmp = `${f}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rec, null, 2));
    fs.renameSync(tmp, f);
  }
  async appendEvents(engagementId: string, events: HistoryEvent[]): Promise<void> {
    const f = path.join(this.dir, "_events.events.json");
    const cur: (HistoryEvent & { engagementId: string })[] = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
    cur.push(...events.map((e) => ({ ...e, engagementId })));
    fs.writeFileSync(f, JSON.stringify(cur.slice(-5000)));
  }
  async events(limit = 100): Promise<(HistoryEvent & { engagementId: string })[]> {
    const f = path.join(this.dir, "_events.events.json");
    if (!fs.existsSync(f)) return [];
    const cur: (HistoryEvent & { engagementId: string })[] = JSON.parse(fs.readFileSync(f, "utf8"));
    return cur.slice(-limit).reverse();
  }
}

// ---------------------------------------------------------------------------
// Memory store (tests)
// ---------------------------------------------------------------------------

export class MemoryStore implements Store {
  private map = new Map<string, EngagementRecord>();
  private log: (HistoryEvent & { engagementId: string })[] = [];
  async list() {
    return [...this.map.values()].map(toListItem);
  }
  async get(id: string) {
    const r = this.map.get(id);
    return r ? (JSON.parse(JSON.stringify(r)) as EngagementRecord) : null;
  }
  async put(rec: EngagementRecord, baseRevision: number | null) {
    const existing = this.map.get(rec.state.engagement_id);
    if (existing && baseRevision !== null && existing.state.stateRevision !== baseRevision) throw new StaleWriteError(baseRevision, existing.state.stateRevision);
    this.map.set(rec.state.engagement_id, JSON.parse(JSON.stringify(rec)));
  }
  async appendEvents(engagementId: string, events: HistoryEvent[]) {
    this.log.push(...events.map((e) => ({ ...e, engagementId })));
  }
  async events(limit = 100) {
    return this.log.slice(-limit).reverse();
  }
}

// ---------------------------------------------------------------------------
// Postgres store
// ---------------------------------------------------------------------------

export class PostgresStore implements Store {
  private ready: Promise<void> | null = null;
  private async sql() {
    const mod = await import("@vercel/postgres");
    return mod.sql;
  }
  private async ensure() {
    if (!this.ready) {
      this.ready = (async () => {
        const sql = await this.sql();
        await sql`CREATE TABLE IF NOT EXISTS factory_engagements (engagement_id TEXT PRIMARY KEY, state JSONB NOT NULL, runtime JSONB NOT NULL, revision INTEGER NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
        await sql`CREATE TABLE IF NOT EXISTS factory_events (id BIGSERIAL PRIMARY KEY, engagement_id TEXT NOT NULL, event JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
      })();
    }
    return this.ready;
  }
  async list(): Promise<EngagementListItem[]> {
    await this.ensure();
    const sql = await this.sql();
    const { rows } = await sql`SELECT state, runtime FROM factory_engagements ORDER BY updated_at DESC`;
    return rows.map((r) => toListItem({ state: r.state as FactoryState, runtime: r.runtime as RuntimeContext }));
  }
  async get(id: string): Promise<EngagementRecord | null> {
    await this.ensure();
    const sql = await this.sql();
    const { rows } = await sql`SELECT state, runtime FROM factory_engagements WHERE engagement_id = ${id}`;
    if (!rows.length) return null;
    return { state: rows[0].state as FactoryState, runtime: rows[0].runtime as RuntimeContext };
  }
  async put(rec: EngagementRecord, baseRevision: number | null): Promise<void> {
    await this.ensure();
    const sql = await this.sql();
    const id = rec.state.engagement_id;
    const state = JSON.stringify(rec.state);
    const runtime = JSON.stringify(rec.runtime);
    if (baseRevision === null) {
      await sql`INSERT INTO factory_engagements (engagement_id, state, runtime, revision, updated_at) VALUES (${id}, ${state}::jsonb, ${runtime}::jsonb, ${rec.state.stateRevision}, now())
        ON CONFLICT (engagement_id) DO UPDATE SET state = EXCLUDED.state, runtime = EXCLUDED.runtime, revision = EXCLUDED.revision, updated_at = now()`;
      return;
    }
    const res = await sql`UPDATE factory_engagements SET state = ${state}::jsonb, runtime = ${runtime}::jsonb, revision = ${rec.state.stateRevision}, updated_at = now() WHERE engagement_id = ${id} AND revision = ${baseRevision}`;
    if (res.rowCount === 0) {
      const cur = await this.get(id);
      throw new StaleWriteError(baseRevision, cur?.state.stateRevision ?? -1);
    }
  }
  async appendEvents(engagementId: string, events: HistoryEvent[]): Promise<void> {
    await this.ensure();
    const sql = await this.sql();
    for (const e of events) await sql`INSERT INTO factory_events (engagement_id, event) VALUES (${engagementId}, ${JSON.stringify(e)}::jsonb)`;
  }
  async events(limit = 100) {
    await this.ensure();
    const sql = await this.sql();
    const { rows } = await sql`SELECT engagement_id, event FROM factory_events ORDER BY id DESC LIMIT ${limit}`;
    return rows.map((r) => ({ ...(r.event as HistoryEvent), engagementId: r.engagement_id as string }));
  }
}

let singleton: Store | null = null;

export function getStore(): Store {
  if (singleton) return singleton;
  if (process.env.POSTGRES_URL) singleton = new PostgresStore();
  else singleton = new FileStore(path.join(process.cwd(), "data", "engagements"));
  return singleton;
}

export function setStore(s: Store | null) {
  singleton = s;
}
