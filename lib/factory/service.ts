/**
 * Service layer: load → apply governed action → persist (with optimistic concurrency) → emit events.
 */

import { ActionError, applyAction, type ActionRequest, type ActionResult } from "./actions";
import { projectRuntime } from "./projection";
import { createEngagementState, type CreateEngagementInput } from "./state";
import { getStore, StaleWriteError, type EngagementRecord } from "./store";
import type { Actor } from "./schema";

export async function loadEngagement(engagementId: string): Promise<EngagementRecord> {
  const rec = await getStore().get(engagementId);
  if (!rec) throw new ActionError("NOT_FOUND", `Engagement ${engagementId} not found`);
  return rec;
}

export interface RunActionInput extends Omit<ActionRequest, "engagementId" | "expectedStateRevision"> {
  /** When omitted the current authoritative revision is used (caller accepts last-writer semantics for that read). */
  expectedStateRevision?: number;
}

export async function runAction(engagementId: string, input: RunActionInput): Promise<ActionResult> {
  const store = getStore();
  const rec = await loadEngagement(engagementId);
  const req: ActionRequest = { ...input, engagementId, expectedStateRevision: input.expectedStateRevision ?? rec.state.stateRevision };
  const result = applyAction(rec.state, req, rec.runtime);
  try {
    await store.put({ state: result.state, runtime: result.runtime }, rec.state.stateRevision);
  } catch (e) {
    if (e instanceof StaleWriteError) throw new ActionError("STALE_REVISION", e.message);
    throw e;
  }
  await store.appendEvents(engagementId, result.events);
  return result;
}

export async function startEngagement(input: CreateEngagementInput, actor: Actor): Promise<EngagementRecord> {
  const state = createEngagementState(input);
  const at = state.stateUpdatedAt;
  state.history.push({ eventId: "EVT-00001", type: "ENGAGEMENT_STARTED", at, stateRevision: 0, actor, summary: `Engagement ${state.engagementSetup.engagementName} started for ${state.engagementSetup.clientName}`, correlationId: "COR-start", refs: [] });
  state.counters.EVT = 1;
  const runtime = projectRuntime(state);
  const rec = { state, runtime };
  await getStore().put(rec, null);
  await getStore().appendEvents(state.engagement_id, state.history);
  return rec;
}

/** Continue from state: reload the authoritative state, regenerate the projection, never trust the stored summary. */
export async function continueFromState(engagementId: string): Promise<EngagementRecord & { regenerated: boolean }> {
  const rec = await loadEngagement(engagementId);
  const fresh = projectRuntime(rec.state);
  const regenerated = rec.runtime.projection_of_state_revision !== rec.state.stateRevision;
  if (regenerated) await getStore().put({ state: rec.state, runtime: fresh }, rec.state.stateRevision);
  return { state: rec.state, runtime: fresh, regenerated };
}
