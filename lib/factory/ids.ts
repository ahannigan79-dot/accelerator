import type { FactoryState } from "./schema";

/** Stable, monotonic IDs per engagement. Mutates the counters map on the given state. */
export function nextId(state: FactoryState, prefix: string, pad = 3): string {
  const n = (state.counters[prefix] ?? 0) + 1;
  state.counters[prefix] = n;
  return `${prefix}-${String(n).padStart(pad, "0")}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function correlationId(): string {
  return `COR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function slugify(s: string): string {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .slice(0, 24)
    .replace(/^-+|-+$/g, "");
}
