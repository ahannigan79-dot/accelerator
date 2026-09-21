/**
 * Governed Action API.
 *
 * Every material mutation runs the same transaction:
 *  1. validate requested action (schema, engagement identity, expected revision)
 *  2. verify actor authority
 *  3. verify object authority / review state and deterministic preconditions
 *  4. mutate authoritative Factory State
 *  5. increment stateRevision exactly once
 *  6. append history / decision lineage
 *  7. regenerate Runtime projection
 *  8. verify revision coherence
 *  9. expose the next permitted human action
 * Persistence is the caller's job (see service.ts) so this module stays pure.
 */

import { activeSteps, BASIS_VALUES, nextRuleId, defaultAuthority, defaultImplementation, designCompletionSummary, invalidateDependents, stepId as mkStepId, type Blueprint, type Check, type CitationVerdict, type HumanAction, type Rule, type WorkflowStep, type WorkflowStepInput } from "./blueprint";
import { generateBuildContract, type RepositoryRealizationPlan } from "./build";
import { CONTENT_KEYS, enterpriseEntryCount, getBlueprint, getBuildContract, getEnterpriseContext, getIntegrationContract, getSimulationPacks, getTechnicalDesign } from "./content";
import { actorMayDecide, GATE_APPROVER_ROLES, recordDecision } from "./decisions";
import { assessAllRequirements, assessDiscoverySufficiency, detectContradictions } from "./evidence";
import { evaluateAllGates, STAGE_EXIT_GATE } from "./gates";
import { clone, correlationId, nextId } from "./ids";
import { canTransition, type IntegrationDataContract, type ReadinessState } from "./integration";
import { verifyEvidenceIdentity } from "./isolation";
import { canAdvance, nextStage } from "./lifecycle";
import type { TransformationPlan } from "./planner";
import { projectRuntime, isRuntimeStale } from "./projection";
import { bumpMinor, bumpVersion, currentArtifact, registerArtifact } from "./artifacts";
import {
  DECISION_TYPES,
  ENTERPRISE_SECTIONS,
  GATE_IDS,
  TARGET_DESIGN_MODES,
  type Actor,
  type EnterpriseContext,
  type EnterpriseEntry,
  type ActorRole,
  type DecisionType,
  type EventType,
  type EvidenceRecord,
  type FactoryState,
  type GateId,
  type HistoryEvent,
  type LifecycleStage,
  type NextHumanAction,
  type PendingHumanDecision,
  type Recommendation,
  type RuntimeContext,
  type TargetObject,
} from "./schema";
import { createPack, invalidateRuns, runBatch, type BusinessFeedback, type SimulationMode, SIMULATION_MODES } from "./simulation";
import { compileTechnicalDesign } from "./technical";
import { validateImplementation } from "./validator";

export const ACTION_TYPES = [
  "UPLOAD_EVIDENCE",
  "ASSESS_EVIDENCE",
  "RESOLVE_CONTRADICTION",
  "RAISE_ITEM",
  "ANSWER_QUESTION",
  "REQUEST_DECISION",
  "DECIDE",
  "EVALUATE_GATE",
  "ADVANCE_STAGE",
  "SUBMIT_FOR_REVIEW",
  "UPDATE_BLUEPRINT",
  "SET_VALUE_NORTH_STAR",
  "SET_ENTERPRISE_CONTEXT",
  "SET_EXPERIENCE",
  "GENERATE_EXPERIENCE",
  "SET_INTEGRATION_CONTRACT",
  "UPDATE_INTEGRATION",
  "SET_OBSERVABILITY",
  "COMPILE_TECHNICAL_DESIGN",
  "SET_TRANSFORMATION_PLAN",
  "GENERATE_BUILD_CONTRACT",
  "REGISTER_REALIZATION_PLAN",
  "RUN_VALIDATION",
  "CREATE_SIMULATION",
  "RUN_SIMULATION_BATCH",
  "RECORD_SIMULATION_FEEDBACK",
  "QUEUE_JOB",
  "START_JOB",
  "CHECKPOINT_JOB",
  "INTERRUPT_JOB",
  "RESUME_JOB",
  "COMPLETE_JOB",
  "FAIL_JOB",
  "CHECKPOINT",
  "CORRECT_STATE",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export interface ActionRequest {
  actionRequestId?: string;
  engagementId: string;
  expectedStateRevision: number;
  actor: Actor;
  actionType: ActionType;
  targetObject?: TargetObject;
  payload?: Record<string, unknown>;
  reason?: string;
}

export interface ActionResult {
  state: FactoryState;
  runtime: RuntimeContext;
  events: HistoryEvent[];
  nextHumanAction: NextHumanAction;
  message: string;
  /** Data the caller may need (e.g. created job id). */
  data?: Record<string, unknown>;
}

export class ActionError extends Error {
  constructor(
    public code: "INVALID_REQUEST" | "STALE_REVISION" | "UNAUTHORIZED" | "PRECONDITION_FAILED" | "NOT_FOUND" | "ISOLATION",
    message: string,
  ) {
    super(message);
  }
}

const MAX_EVIDENCE_CONTENT = 60_000;
const CONSULTANT: ActorRole[] = ["CONSULTANT", "DELIVERY_LEAD"];
const ANY_HUMAN: ActorRole[] = ["CONSULTANT", "DELIVERY_LEAD", "CLIENT_BUSINESS_OWNER", "CLIENT_PROCESS_OWNER", "CLIENT_ARCHITECT", "ARB", "SECURITY_PRIVACY", "CLIENT_IT_OPERATIONS"];
const CONTROL_PLANE: ActorRole[] = [...ANY_HUMAN, "AI_SPECIALIST"];

/** Who may invoke each action. Decisions are further checked against the target's authorized roles. */
export const ACTION_ROLES: Record<ActionType, ActorRole[]> = {
  UPLOAD_EVIDENCE: CONSULTANT,
  ASSESS_EVIDENCE: CONTROL_PLANE,
  RESOLVE_CONTRADICTION: ANY_HUMAN,
  RAISE_ITEM: CONTROL_PLANE,
  ANSWER_QUESTION: ANY_HUMAN,
  REQUEST_DECISION: CONTROL_PLANE,
  DECIDE: ANY_HUMAN,
  EVALUATE_GATE: CONTROL_PLANE,
  ADVANCE_STAGE: CONSULTANT,
  SUBMIT_FOR_REVIEW: CONSULTANT,
  UPDATE_BLUEPRINT: [...CONSULTANT, "CLIENT_PROCESS_OWNER", "CLIENT_BUSINESS_OWNER", "CLIENT_ARCHITECT"],
  SET_VALUE_NORTH_STAR: [...CONSULTANT, "CLIENT_BUSINESS_OWNER", "CLIENT_PROCESS_OWNER"],
  SET_ENTERPRISE_CONTEXT: [...CONSULTANT, "CLIENT_ARCHITECT", "CLIENT_IT_OPERATIONS", "SECURITY_PRIVACY"],
  SET_EXPERIENCE: CONSULTANT,
  GENERATE_EXPERIENCE: CONSULTANT,
  SET_INTEGRATION_CONTRACT: [...CONSULTANT, "CLIENT_ARCHITECT"],
  UPDATE_INTEGRATION: [...CONSULTANT, "CLIENT_ARCHITECT", "CLIENT_IT_OPERATIONS"],
  SET_OBSERVABILITY: [...CONSULTANT, "CLIENT_ARCHITECT", "CLIENT_IT_OPERATIONS"],
  COMPILE_TECHNICAL_DESIGN: CONSULTANT,
  SET_TRANSFORMATION_PLAN: CONSULTANT,
  GENERATE_BUILD_CONTRACT: CONSULTANT,
  REGISTER_REALIZATION_PLAN: CONSULTANT,
  RUN_VALIDATION: CONSULTANT,
  CREATE_SIMULATION: [...CONSULTANT, "CLIENT_PROCESS_OWNER"],
  RUN_SIMULATION_BATCH: CONTROL_PLANE,
  RECORD_SIMULATION_FEEDBACK: ANY_HUMAN,
  QUEUE_JOB: CONTROL_PLANE,
  START_JOB: CONTROL_PLANE,
  CHECKPOINT_JOB: CONTROL_PLANE,
  INTERRUPT_JOB: CONTROL_PLANE,
  RESUME_JOB: CONTROL_PLANE,
  COMPLETE_JOB: CONTROL_PLANE,
  FAIL_JOB: CONTROL_PLANE,
  CHECKPOINT: CONTROL_PLANE,
  CORRECT_STATE: ["DELIVERY_LEAD"],
};

interface Ctx {
  state: FactoryState;
  req: ActionRequest;
  at: string;
  now: Date;
  events: { type: EventType; summary: string; refs?: string[] }[];
  message: string;
  data: Record<string, unknown>;
}

function str(v: unknown, name: string, required = true): string {
  if (typeof v !== "string" || (required && !v.trim())) throw new ActionError("INVALID_REQUEST", `payload.${name} must be a non-empty string`);
  return v;
}
function arr<T = unknown>(v: unknown, name: string): T[] {
  if (!Array.isArray(v)) throw new ActionError("INVALID_REQUEST", `payload.${name} must be an array`);
  return v as T[];
}
function pre(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ActionError("PRECONDITION_FAILED", msg);
}
function requireBlueprint(ctx: Ctx): Blueprint {
  const bp = getBlueprint(ctx.state);
  pre(bp, "No workflow blueprint exists for this engagement");
  return bp;
}

// ---------------------------------------------------------------------------
// Deterministic recomputation after any evidence/decision change
// ---------------------------------------------------------------------------

function recompute(ctx: Ctx) {
  const s = ctx.state;
  s.evidenceReadinessProfile.requirements = assessAllRequirements(s, ctx.now);
  // Contradictions: keep existing (with resolution status), add newly detected.
  const known = new Set(s.discoverySufficiency.contradictions.map((c) => c.topic + "|" + [...c.evidenceRefs].sort().join(",")));
  for (const d of detectContradictions(s)) {
    const key = d.topic + "|" + [...d.evidenceRefs].sort().join(",");
    if (!known.has(key) && !s.discoverySufficiency.contradictions.some((c) => c.topic === d.topic && c.status === "RESOLVED" && d.evidenceRefs.every((r) => c.evidenceRefs.includes(r)))) {
      s.discoverySufficiency.contradictions.push({ contradictionId: nextId(s, "CON"), topic: d.topic, evidenceRefs: d.evidenceRefs, description: d.description, status: "OPEN" });
    }
  }
  s.discoverySufficiency = assessDiscoverySufficiency(s, ctx.now);
}

function evaluateGates(ctx: Ctx) {
  const s = ctx.state;
  const all = evaluateAllGates(s, ctx.now);
  for (const g of GATE_IDS) s.gates[g] = all[g];
  const cur = STAGE_EXIT_GATE[s.currentStage];
  s.latestGateEvaluation = cur ? all[cur] : null;
}

function touchStageExecution(ctx: Ctx, status: FactoryState["activeStageExecution"]["status"]) {
  ctx.state.activeStageExecution = { ...ctx.state.activeStageExecution, status, updatedAt: ctx.at };
  ctx.events.push({ type: "STAGE_EXECUTION_CHANGED", summary: `${ctx.state.currentStage} execution → ${status}` });
}

function bumpBlueprint(ctx: Ctx, bp: Blueprint, summary: string, affectedStepIds: string[], invalidate = true) {
  let next = bp;
  let invalidated: string[] = [];
  if (invalidate && affectedStepIds.length) {
    const r = invalidateDependents(bp, affectedStepIds);
    next = r.blueprint;
    invalidated = r.invalidated;
  }
  next.version = bumpVersion(next.version);
  next.changeLog.push({ at: ctx.at, stateRevision: ctx.state.stateRevision + 1, summary, affectedIds: affectedStepIds, by: `${ctx.req.actor.role}:${ctx.req.actor.userId}` });
  ctx.state.artifactContent[CONTENT_KEYS.blueprint] = next;
  const art = currentArtifact(ctx.state, "WORKFLOW_BLUEPRINT");
  if (art) art.version = next.version;
  // Targeted invalidation of simulation runs whose sources changed.
  const packs = getSimulationPacks(ctx.state);
  const changedIds = [...affectedStepIds, ...invalidated];
  for (const [id, pack] of Object.entries(packs)) packs[id] = invalidateRuns(pack, changedIds).pack;
  ctx.state.artifactContent[CONTENT_KEYS.simulationPacks] = packs;
  ctx.events.push({ type: "WORKFLOW_CHANGED", summary: `${summary} (v${next.version}${invalidated.length ? `; re-review: ${invalidated.join(", ")}` : ""})`, refs: affectedStepIds });
  return next;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const handlers: Record<ActionType, (ctx: Ctx) => void> = {
  UPLOAD_EVIDENCE(ctx) {
    const s = ctx.state;
    const records = arr<Partial<EvidenceRecord>>(ctx.req.payload?.records, "records");
    pre(records.length, "No evidence records supplied");
    const accepted: string[] = [];
    const quarantined: string[] = [];
    for (const r of records) {
      const rec: EvidenceRecord = {
        evidenceRef: nextId(s, "EV"),
        engagementId: r.engagementId ?? s.engagement_id,
        workflowId: r.workflowId ?? s.workflowId,
        title: str(r.title, "records[].title"),
        evidenceType: (r.evidenceType ?? "PROCESS_DOCUMENT") as EvidenceRecord["evidenceType"],
        sourceClass: (r.sourceClass ?? "CLIENT_INFORMAL") as EvidenceRecord["sourceClass"],
        authorityStatus: "CURRENT",
        synthetic: !!r.synthetic || r.sourceClass === "SYNTHETIC_SIMULATION",
        environment: (r.environment ?? "NONE") as EvidenceRecord["environment"],
        capturedAt: r.capturedAt ?? ctx.at,
        expiresAt: r.expiresAt,
        requirementIds: Array.isArray(r.requirementIds) ? r.requirementIds : [],
        scope: r.scope ?? "WORKFLOW",
        claims: Array.isArray(r.claims) ? r.claims : [],
        summary: r.summary ?? "",
        content: typeof r.content === "string" && r.content.trim() ? r.content.slice(0, MAX_EVIDENCE_CONTENT) : undefined,
        fileName: typeof r.fileName === "string" ? r.fileName : undefined,
      };
      const v = verifyEvidenceIdentity(s, rec);
      if (!v.accepted) {
        rec.authorityStatus = "QUARANTINED";
        rec.quarantineReason = v.reason;
        rec.requirementIds = [];
        quarantined.push(rec.evidenceRef);
        s.evidenceCatalog.push(rec);
        ctx.events.push({ type: "EVIDENCE_QUARANTINED", summary: `${rec.evidenceRef} quarantined: ${v.reason}`, refs: [rec.evidenceRef] });
        continue;
      }
      if (r.supersededBy === undefined && typeof (r as Record<string, unknown>).supersedes === "string") {
        const prev = s.evidenceCatalog.find((e) => e.evidenceRef === (r as Record<string, unknown>).supersedes);
        if (prev) {
          prev.authorityStatus = "SUPERSEDED";
          prev.supersededBy = rec.evidenceRef;
        }
      }
      s.evidenceCatalog.push(rec);
      accepted.push(rec.evidenceRef);
    }
    if (accepted.length) ctx.events.push({ type: "EVIDENCE_INGESTED", summary: `${accepted.length} evidence record(s) ingested`, refs: accepted });
    recompute(ctx);
    ctx.events.push({ type: "EVIDENCE_ASSESSED", summary: "Evidence readiness and discovery sufficiency reassessed" });
    ctx.message = `${accepted.length} record(s) accepted${quarantined.length ? `, ${quarantined.length} quarantined (cross-engagement)` : ""}.`;
    ctx.data = { accepted, quarantined };
  },

  ASSESS_EVIDENCE(ctx) {
    recompute(ctx);
    ctx.events.push({ type: "EVIDENCE_ASSESSED", summary: "Evidence readiness and discovery sufficiency reassessed" });
    ctx.message = "Evidence readiness reassessed deterministically.";
  },

  RESOLVE_CONTRADICTION(ctx) {
    const s = ctx.state;
    const id = str(ctx.req.payload?.contradictionId, "contradictionId");
    const resolution = str(ctx.req.payload?.resolution, "resolution");
    const c = s.discoverySufficiency.contradictions.find((x) => x.contradictionId === id);
    if (!c) throw new ActionError("NOT_FOUND", `Contradiction ${id} not found`);
    pre(c.status === "OPEN", "Contradiction already resolved");
    const supersede = Array.isArray(ctx.req.payload?.supersedeEvidenceRefs) ? (ctx.req.payload!.supersedeEvidenceRefs as string[]) : [];
    const dec = recordDecision(s, { decisionId: nextId(s, "DEC"), type: "RESOLVE_CONTRADICTION", target: { type: "CONTRADICTION", id }, actor: ctx.req.actor, rationale: resolution, payload: { supersedeEvidenceRefs: supersede }, at: ctx.at }, s.currentStage);
    for (const ref of supersede) {
      const rec = s.evidenceCatalog.find((e) => e.evidenceRef === ref);
      if (rec) rec.authorityStatus = "SUPERSEDED";
    }
    c.status = "RESOLVED";
    c.resolvedByDecisionId = dec.decisionId;
    recompute(ctx);
    ctx.events.push({ type: "DECISION_RECORDED", summary: `Contradiction ${id} resolved by ${dec.decisionId}`, refs: [id, dec.decisionId] });
    ctx.message = `Contradiction ${id} resolved.`;
  },

  RAISE_ITEM(ctx) {
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    const kind = (p.kind ?? "TO_CONFIRM") as FactoryState["openItems"][number]["kind"];
    const item = { itemId: nextId(s, kind === "TO_CONFIRM" ? "TC" : kind === "BLOCKER" ? "BLK" : "OPN"), kind, title: str(p.title, "title"), detail: String(p.detail ?? ""), owner: String(p.owner ?? "TO_CONFIRM"), stage: s.currentStage, relatedIds: Array.isArray(p.relatedIds) ? (p.relatedIds as string[]) : [], status: "OPEN" as const, raisedAt: ctx.at };
    s.openItems.push(item);
    recompute(ctx);
    ctx.events.push({ type: kind === "BLOCKER" ? "BLOCKER_RAISED" : "DECISION_REQUESTED", summary: `${kind} raised: ${item.title}`, refs: [item.itemId] });
    ctx.message = `${item.itemId} raised.`;
    ctx.data = { itemId: item.itemId };
  },

  ANSWER_QUESTION(ctx) {
    const s = ctx.state;
    const id = str(ctx.req.payload?.itemId, "itemId");
    const answer = str(ctx.req.payload?.answer, "answer");
    const item = s.openItems.find((o) => o.itemId === id);
    if (!item) throw new ActionError("NOT_FOUND", `Open item ${id} not found`);
    pre(item.status === "OPEN", "Item already resolved");
    const dec = recordDecision(s, { decisionId: nextId(s, "DEC"), type: "ANSWER", target: { type: "OPEN_ITEM", id }, actor: ctx.req.actor, rationale: answer, at: ctx.at }, s.currentStage);
    item.status = "RESOLVED";
    item.answer = answer;
    item.resolvedByDecisionId = dec.decisionId;
    if (id === "TC-001" && s.engagementSetup.clientObjective === "TO_CONFIRM") s.engagementSetup.clientObjective = answer;
    recompute(ctx);
    ctx.events.push({ type: item.kind === "BLOCKER" ? "BLOCKER_CLEARED" : "DECISION_RECORDED", summary: `${id} answered by ${ctx.req.actor.role}`, refs: [id, dec.decisionId] });
    ctx.message = `${id} resolved.`;
  },

  REQUEST_DECISION(ctx) {
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    const target = p.target as TargetObject | undefined;
    pre(target && typeof target.id === "string", "target required");
    const allowedRoles = (Array.isArray(p.allowedRoles) && p.allowedRoles.length ? p.allowedRoles : GATE_APPROVER_ROLES[target.id as GateId] ?? ["CLIENT_BUSINESS_OWNER"]) as ActorRole[];
    pre(!allowedRoles.includes("AI_SPECIALIST"), "AI_SPECIALIST can never be a decision role");
    const rec = p.recommendation as Recommendation | undefined;
    const pd: PendingHumanDecision = {
      requestId: nextId(s, "REQ"),
      title: str(p.title, "title"),
      question: str(p.question, "question"),
      stage: s.currentStage,
      target,
      allowedRoles,
      allowedTypes: (Array.isArray(p.allowedTypes) && p.allowedTypes.length ? p.allowedTypes : ["APPROVE", "REJECT", "REQUEST_CHANGES"]) as DecisionType[],
      recommendation: rec ? { ...rec, producedAt: rec.producedAt ?? ctx.at, sourceStateRevision: rec.sourceStateRevision ?? s.stateRevision, recommendationRef: rec.recommendationRef ?? nextId(s, "REC") } : undefined,
      requestedAt: ctx.at,
      requestedBy: ctx.req.actor.role === "AI_SPECIALIST" ? "AI" : "HUMAN",
      status: "PENDING",
    };
    s.pendingHumanDecisions.push(pd);
    ctx.events.push({ type: "DECISION_REQUESTED", summary: `${pd.requestId}: ${pd.title}`, refs: [pd.requestId] });
    ctx.message = `Decision ${pd.requestId} requested.`;
    ctx.data = { requestId: pd.requestId };
  },

  DECIDE(ctx) {
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    const type = p.type as DecisionType;
    pre(DECISION_TYPES.includes(type), `Unknown decision type ${String(p.type)}`);
    const target = (ctx.req.targetObject ?? p.target) as TargetObject | undefined;
    pre(target && typeof target.id === "string", "target required");
    const rationale = str(p.rationale, "rationale");
    const requestId = typeof p.requestId === "string" ? p.requestId : undefined;
    const pending = requestId ? s.pendingHumanDecisions.find((x) => x.requestId === requestId) : s.pendingHumanDecisions.find((x) => x.status === "PENDING" && x.target.type === target.type && x.target.id === target.id);
    if (pending) {
      pre(pending.status === "PENDING", `${pending.requestId} already resolved`);
      const auth = actorMayDecide(ctx.req.actor, pending.allowedRoles);
      if (!auth.ok) throw new ActionError("UNAUTHORIZED", auth.reason);
      pre(pending.allowedTypes.includes(type) || type === "ACCEPT_RECOMMENDATION", `Decision type ${type} not permitted for ${pending.requestId} (allowed: ${pending.allowedTypes.join(", ")})`);
    }
    // Target-specific authority and preconditions.
    if (target.type === "GATE") {
      const gateId = target.id as GateId;
      pre(GATE_IDS.includes(gateId), `Unknown gate ${target.id}`);
      const auth = actorMayDecide(ctx.req.actor, GATE_APPROVER_ROLES[gateId]);
      if (!auth.ok) throw new ActionError("UNAUTHORIZED", auth.reason);
      pre(STAGE_EXIT_GATE[s.currentStage] === gateId, `Gate ${gateId} does not govern the current stage ${s.currentStage}`);
      // Always decide against a fresh deterministic evaluation.
      recompute(ctx);
      evaluateGates(ctx);
      if (type === "APPROVE") {
        const ev = s.gates[gateId];
        pre(ev, `Gate ${gateId} could not be evaluated`);
        const nonHuman = ev.hardStops.filter((h) => !h.includes("HUMAN-APPROVAL"));
        pre(nonHuman.length === 0, `Cannot approve: deterministic hard stops remain — ${nonHuman.join("; ")}`);
        if (target.revision !== undefined) pre(String(target.revision) === String(s.stateRevision), `Approval targets revision ${target.revision}; current is ${s.stateRevision}`);
      }
      if (type === "ACCEPT_CONDITIONAL") {
        const ev = s.gates[gateId];
        pre(ev && ev.conditions.length > 0 && ev.hardStops.every((h) => h.includes("HUMAN-APPROVAL")), `Gate ${gateId} has no acceptable conditions (outcome ${ev?.outcome ?? "none"}; deterministic hard stops must be cleared first)`);
        p.payload = { ...((p.payload as Record<string, unknown>) ?? {}), conditions: ev.conditions };
      }
    } else {
      const auth = actorMayDecide(ctx.req.actor, pending?.allowedRoles ?? ANY_HUMAN);
      if (!auth.ok) throw new ActionError("UNAUTHORIZED", auth.reason);
    }
    const recRef = typeof p.recommendationRef === "string" ? p.recommendationRef : pending?.recommendation?.recommendationRef;
    const dec = recordDecision(s, { decisionId: nextId(s, "DEC"), type, target, actor: ctx.req.actor, rationale, payload: (p.payload as Record<string, unknown>) ?? undefined, recommendationRef: recRef, at: ctx.at }, s.currentStage);
    if (pending) {
      pending.status = "RESOLVED";
      pending.resolvedByDecisionId = dec.decisionId;
    }
    ctx.events.push({ type: "DECISION_RECORDED", summary: `${dec.decisionId} ${type} on ${target.type} ${target.id} by ${ctx.req.actor.role}`, refs: [dec.decisionId, target.id] });

    // Effects.
    const payload = (p.payload as Record<string, unknown>) ?? {};
    switch (type) {
      case "APPROVE": {
        if (target.type === "GATE") {
          s.clientApprovals[target.id as GateId] = { decisionId: dec.decisionId, approvedAt: ctx.at, actor: ctx.req.actor };
          touchStageExecution(ctx, "APPROVAL_PENDING");
        } else if (target.type === "EXPERIENCE") {
          pre(s.currentStage === "EXPERIENCE" && s.experience.substage === "EXPERIENCE_REVIEW", "Experience is not in review");
          s.experience.reviewOutcome = "APPROVED";
          s.experience.reviewDecisionId = dec.decisionId;
        } else if (target.type === "ARTIFACT") {
          const art = s.authoritativeArtifacts.find((a) => a.artifactId === target.id);
          if (art) art.reviewStatus = "CONFIRMED";
        }
        break;
      }
      case "REJECT":
      case "REQUEST_CHANGES": {
        if (target.type === "GATE") {
          delete s.clientApprovals[target.id as GateId];
          touchStageExecution(ctx, "CORRECTION_REQUIRED");
          s.activeStageReview.status = "CHANGES_REQUESTED";
        } else if (target.type === "EXPERIENCE") {
          s.experience.reviewOutcome = "CHANGES_REQUESTED";
          s.experience.substage = "EXPERIENCE_GENERATION";
        } else if (target.type === "ARTIFACT") {
          const art = s.authoritativeArtifacts.find((a) => a.artifactId === target.id);
          if (art) art.reviewStatus = "CHANGES_REQUESTED";
        }
        break;
      }
      case "SELECT_TARGET_PATH": {
        const mode = payload.mode as FactoryState["targetDesignMode"];
        pre(TARGET_DESIGN_MODES.includes(mode) && mode !== "NOT_SELECTED", "payload.mode must be AI_NATIVE_REIMAGINED | BASELINE_PRESERVED | CLIENT_DIRECTED");
        pre(s.currentStage === "TARGET_PATH_SELECTION", "Target path can only be selected in TARGET_PATH_SELECTION");
        s.targetDesignMode = mode;
        const bp = requireBlueprint(ctx);
        const target: Blueprint = clone(bp);
        target.mode = "TARGET";
        target.version = bumpMinor(bp.version);
        target.steps.forEach((st) => {
          st.origin = "BASELINE";
          if (mode !== "BASELINE_PRESERVED") st.status = "open";
        });
        target.changeLog.push({ at: ctx.at, stateRevision: s.stateRevision + 1, summary: `Target design opened from baseline v${bp.version} in mode ${mode}`, affectedIds: [], by: `${ctx.req.actor.role}:${ctx.req.actor.userId}` });
        s.artifactContent[CONTENT_KEYS.blueprint] = target;
        registerArtifact(s, { kind: "WORKFLOW_BLUEPRINT", title: "Target Workflow Blueprint", version: target.version, producedBy: "CONTROL_PLANE", upstream: [{ artifactId: currentArtifact(s, "CURRENT_STATE_BASELINE")?.artifactId ?? "", version: bp.version }], contentKey: CONTENT_KEYS.blueprint, summary: `Target design in mode ${mode}` }, ctx.at);
        ctx.events.push({ type: "TARGET_PATH_SELECTED", summary: `Target design mode ${mode}`, refs: [dec.decisionId] });
        break;
      }
      case "WAIVE": {
        pre(target.type === "EVIDENCE_REQUIREMENT", "WAIVE targets an EVIDENCE_REQUIREMENT");
        const req = s.evidenceReadinessProfile.requirements.find((r) => r.requirementId === target.id);
        if (!req) throw new ActionError("NOT_FOUND", `Requirement ${target.id} not found`);
        const auth = actorMayDecide(ctx.req.actor, req.waiverAuthority);
        if (!auth.ok) throw new ActionError("UNAUTHORIZED", `Waiver: ${auth.reason}`);
        const expiresAt = str(payload.expiresAt, "payload.expiresAt");
        pre(new Date(expiresAt).getTime() > ctx.now.getTime(), "Waiver expiry must be in the future");
        s.waivers = s.waivers.filter((w) => w.requirementId !== req.requirementId);
        s.waivers.push({ waiverId: nextId(s, "WAIV"), engagementId: s.engagement_id, stage: s.currentStage, gateId: req.requiredByGate, requirementId: req.requirementId, decisionId: dec.decisionId, authorizedRole: ctx.req.actor.role, rationale, evidenceRefs: Array.isArray(payload.evidenceRefs) ? (payload.evidenceRefs as string[]) : [], grantedAt: ctx.at, reviewBy: typeof payload.reviewBy === "string" ? payload.reviewBy : expiresAt, expiresAt, status: "ACTIVE" });
        ctx.events.push({ type: "WAIVER_GRANTED", summary: `${req.requirementId} waived until ${expiresAt.slice(0, 10)}`, refs: [req.requirementId, dec.decisionId] });
        break;
      }
      case "NOT_APPLICABLE": {
        pre(target.type === "EVIDENCE_REQUIREMENT", "NOT_APPLICABLE targets an EVIDENCE_REQUIREMENT");
        const req = s.evidenceReadinessProfile.requirements.find((r) => r.requirementId === target.id);
        if (!req) throw new ActionError("NOT_FOUND", `Requirement ${target.id} not found`);
        const auth = actorMayDecide(ctx.req.actor, req.waiverAuthority);
        if (!auth.ok) throw new ActionError("UNAUTHORIZED", `N/A: ${auth.reason}`);
        s.notApplicable = s.notApplicable.filter((n) => n.requirementId !== req.requirementId);
        s.notApplicable.push({ requirementId: req.requirementId, decisionId: dec.decisionId, authorizedRole: ctx.req.actor.role, rationale, stage: s.currentStage, gateId: req.requiredByGate });
        break;
      }
      case "ACCEPT_RECOMMENDATION": {
        pre(pending?.recommendation, "No recommendation attached to this request");
        const draft = (pending!.recommendation as Recommendation & { payload?: Record<string, unknown> }).payload ?? (s.artifactContent[`recommendation:${pending!.recommendation!.recommendationRef}`] as Record<string, unknown> | undefined);
        pre(draft, "Recommendation has no payload to accept");
        applyRecommendationPayload(ctx, pending!.recommendation!, draft);
        break;
      }
      case "CORRECT": {
        if (target.type === "BUILD_CONTRACT") {
          const rp = s.artifactContent[CONTENT_KEYS.realizationPlan] as RepositoryRealizationPlan | undefined;
          const conflictIdx = typeof payload.conflictIndex === "number" ? payload.conflictIndex : -1;
          if (rp && rp.conflicts[conflictIdx]) {
            rp.conflicts[conflictIdx].status = "RESOLVED";
            rp.conflicts[conflictIdx].resolutionDecisionId = dec.decisionId;
          }
        }
        break;
      }
      default:
        break;
    }
    recompute(ctx);
    evaluateGates(ctx);
    ctx.message = `${dec.decisionId} recorded (${type}).`;
    ctx.data = { decisionId: dec.decisionId };
  },

  EVALUATE_GATE(ctx) {
    recompute(ctx);
    evaluateGates(ctx);
    const g = STAGE_EXIT_GATE[ctx.state.currentStage];
    const ev = g ? ctx.state.gates[g] : null;
    ctx.events.push({ type: "GATE_EVALUATED", summary: ev ? `${g} → ${ev.outcome}${ev.hardStops.length ? ` (${ev.hardStops.length} hard stop(s))` : ""}` : "No gate governs this stage; all gates refreshed" });
    ctx.message = ev ? `Gate ${g} is ${ev.outcome}.` : "Gates refreshed.";
  },

  ADVANCE_STAGE(ctx) {
    const s = ctx.state;
    recompute(ctx);
    evaluateGates(ctx);
    // A gate evaluated inside this transaction carries the pre-increment revision; canAdvance compares to the same.
    const adv = canAdvance(s);
    pre(adv.ok, `Cannot advance from ${s.currentStage}: ${adv.reasons.join("; ")}`);
    const from = s.currentStage;
    const to = nextStage(from)!;
    // Stage-exit side effects.
    if (from === "BASELINE_APPROVAL") {
      const bp = requireBlueprint(ctx);
      s.artifactContent[CONTENT_KEYS.baselineSnapshot] = clone(bp);
      registerArtifact(s, { kind: "CURRENT_STATE_BASELINE", title: "Approved Current-State Baseline", version: bp.version, producedBy: "CONTROL_PLANE", contentKey: CONTENT_KEYS.baselineSnapshot, summary: "Frozen baseline snapshot retained for comparison", reviewStatus: "CONFIRMED" }, ctx.at);
      ctx.events.push({ type: "BASELINE_CREATED", summary: `Baseline v${bp.version} frozen` });
    }
    if (from === "TARGET_DESIGN_APPROVAL") {
      const bp = requireBlueprint(ctx);
      registerArtifact(s, { kind: "DESIGN_CONTRACT", title: "Approved Target Design Contract", version: bp.version, producedBy: "CONTROL_PLANE", contentKey: CONTENT_KEYS.blueprint, summary: "Approved target design; basis for experience, integration and technical work", reviewStatus: "CONFIRMED" }, ctx.at);
    }
    const approval = adv.gateId ? s.clientApprovals[adv.gateId]?.decisionId : undefined;
    s.currentStage = to;
    s.lifecycleEvidence[to] = { enteredAt: ctx.at, enteredAtRevision: s.stateRevision + 1, byDecisionId: approval };
    s.activeStageExecution = { stage: to, status: to.endsWith("APPROVAL") || to === "TARGET_PATH_SELECTION" ? "IN_REVIEW" : "IN_PROGRESS", startedAt: ctx.at, updatedAt: ctx.at };
    s.activeStageReview = { stage: to, status: to.endsWith("APPROVAL") ? "IN_REVIEW" : "NONE", snapshotArtifactId: s.activeStageReview.snapshotArtifactId };
    if (to === "EXPERIENCE") s.experience = { ...s.experience, substage: "EXPERIENCE_EVIDENCE_INTAKE", reviewOutcome: "NOT_REVIEWED" };
    if (to === "TARGET_DESIGN") {
      const bp = requireBlueprint(ctx);
      if (bp.mode !== "TARGET") {
        bp.mode = "TARGET";
        s.artifactContent[CONTENT_KEYS.blueprint] = bp;
      }
    }
    // Re-evaluate gates for the new stage so the projection is coherent.
    evaluateGates(ctx);
    ctx.events.push({ type: to === "RELEASE_READINESS" ? "RELEASE_GATE_REACHED" : "STAGE_ADVANCED", summary: `${from} → ${to}`, refs: approval ? [approval] : [] });
    ctx.message = `Advanced to ${to}.`;
  },

  SUBMIT_FOR_REVIEW(ctx) {
    const s = ctx.state;
    pre(["BASELINE_DESIGN", "TARGET_DESIGN"].includes(s.currentStage), "Only design stages can be submitted for review");
    const bp = requireBlueprint(ctx);
    const structure = designCompletionSummary(bp).areas.find((a) => a.key === "structure")!;
    pre(structure.complete, `${structure.done} of ${structure.total} steps confirmed; confirm every step before review`);
    if (s.currentStage === "TARGET_DESIGN") {
      const dc = designCompletionSummary(bp);
      pre(dc.complete, `Design not complete: ${[...dc.openAreas, ...dc.invariantViolations].join("; ")}`);
    }
    const snapshot = clone(bp);
    s.artifactContent[CONTENT_KEYS.reviewSnapshot] = snapshot;
    const art = registerArtifact(s, { kind: "WORKFLOW_BLUEPRINT", title: `${s.currentStage === "BASELINE_DESIGN" ? "Baseline" : "Target"} review snapshot`, version: bp.version, producedBy: "CONTROL_PLANE", authority: "REVIEW_SNAPSHOT", contentKey: CONTENT_KEYS.reviewSnapshot, summary: "Protected review copy; stable throughout review dwell", reviewStatus: "IN_REVIEW" }, ctx.at);
    s.activeStageReview = { stage: s.currentStage, snapshotArtifactId: art.artifactId, status: "IN_REVIEW" };
    touchStageExecution(ctx, "REVIEW_READY");
    ctx.events.push({ type: "ARTIFACT_REGISTERED", summary: `Review snapshot ${art.artifactId} (v${bp.version})`, refs: [art.artifactId] });
    ctx.message = "Submitted for review; protected snapshot created.";
  },

  UPDATE_BLUEPRINT(ctx) {
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    const op = str(p.op, "op");
    pre(!["BASELINE_APPROVAL", "TARGET_DESIGN_APPROVAL"].includes(s.currentStage) || s.activeStageExecution.status === "CORRECTION_REQUIRED", "The design is under protected review; request changes first");
    let bp = getBlueprint(s);
    if (op === "REPLACE_BLUEPRINT") {
      const incoming = p.blueprint as Blueprint;
      pre(incoming && Array.isArray(incoming.steps), "payload.blueprint required");
      pre(incoming.workflowId === s.workflowId, `Blueprint workflowId ${incoming.workflowId} does not match ${s.workflowId} (isolation)`);
      const normalized = normalizeBlueprint(incoming, s);
      normalized.version = bp ? bumpVersion(bp.version) : "0.1.0";
      normalized.changeLog = [...(bp?.changeLog ?? []), { at: ctx.at, stateRevision: s.stateRevision + 1, summary: String(p.summary ?? "Blueprint replaced"), affectedIds: normalized.steps.map((x) => x.contractId), by: `${ctx.req.actor.role}:${ctx.req.actor.userId}` }];
      s.artifactContent[CONTENT_KEYS.blueprint] = normalized;
      if (!currentArtifact(s, "WORKFLOW_BLUEPRINT")) registerArtifact(s, { kind: "WORKFLOW_BLUEPRINT", title: `${normalized.mode === "BASELINE" ? "Baseline" : "Target"} Workflow Blueprint`, version: normalized.version, producedBy: ctx.req.actor.role === "AI_SPECIALIST" ? "AI_SPECIALIST" : "HUMAN", contentKey: CONTENT_KEYS.blueprint, summary: String(p.summary ?? "Working design") }, ctx.at);
      else currentArtifact(s, "WORKFLOW_BLUEPRINT")!.version = normalized.version;
      ctx.events.push({ type: "WORKFLOW_CHANGED", summary: `Blueprint replaced (v${normalized.version}, ${normalized.steps.length} steps)` });
      if (s.currentStage === "DISCOVERY" || s.currentStage === "BASELINE_DESIGN") touchStageExecution(ctx, "IN_PROGRESS");
      ctx.message = "Blueprint replaced.";
      return;
    }
    if (op === "CREATE_EMPTY") {
      pre(!bp, "Blueprint already exists");
      const fresh: Blueprint = {
        schema: "ai-delivery-workflow-design-contract-v2",
        workflowId: s.workflowId,
        version: "0.1.0",
        mode: "BASELINE",
        phases: (p.phases as Blueprint["phases"]) ?? [{ key: "main", name: "Main", desc: "Primary phase" }],
        steps: [],
        currentAi: [],
        valueNorthStar: s.valueNorthStar,
        referenceArchitecture: { status: "TO_CONFIRM", note: "", patterns: [] },
        changeLog: [{ at: ctx.at, stateRevision: s.stateRevision + 1, summary: "Blueprint created", affectedIds: [], by: `${ctx.req.actor.role}:${ctx.req.actor.userId}` }],
      };
      s.artifactContent[CONTENT_KEYS.blueprint] = fresh;
      registerArtifact(s, { kind: "WORKFLOW_BLUEPRINT", title: "Baseline Workflow Blueprint", version: fresh.version, producedBy: "HUMAN", contentKey: CONTENT_KEYS.blueprint, summary: "Working design" }, ctx.at);
      ctx.events.push({ type: "WORKFLOW_CHANGED", summary: "Blueprint created" });
      ctx.message = "Blueprint created.";
      return;
    }
    pre(bp, "No blueprint; create one first");
    bp = clone(bp);
    const find = (id: unknown): WorkflowStep => {
      const st = bp!.steps.find((x) => x.contractId === id);
      if (!st) throw new ActionError("NOT_FOUND", `Step ${String(id)} not found`);
      return st;
    };
    const sid = typeof p.stepId === "string" ? p.stepId : undefined;
    switch (op) {
      case "ADD_STEP": {
        const n = bp.steps.reduce((m, x) => Math.max(m, Number(x.contractId.split("-")[1]) || 0), 0) + 1;
        const seq = typeof p.afterSeq === "number" ? p.afterSeq + 0.5 : bp.steps.length + 1;
        const st = normalizeStep({ ...(p.step as WorkflowStepInput), contractId: mkStepId(n), seq, origin: bp.mode === "TARGET" ? "ADDED" : "BASELINE" }, bp);
        bp.steps.push(st);
        resequence(bp);
        bumpBlueprint(ctx, bp, `Added ${st.contractId} ${st.name}`, [st.contractId], false);
        ctx.data = { stepId: st.contractId };
        break;
      }
      case "SET_STEP": {
        const st = find(sid);
        const fields = (p.fields as Partial<WorkflowStep>) ?? {};
        const allowed: (keyof WorkflowStep)[] = ["name", "owner", "lane", "type", "purpose", "trigger", "inputs", "aiRole", "humanAuthority", "systems", "reads", "writes", "exceptions", "rerun", "outcome", "writeback", "notes", "phase", "currentAiRefs", "evidenceRefs", "basis"];
        if (fields.basis && !BASIS_VALUES.includes(fields.basis)) throw new ActionError("INVALID_REQUEST", `Unknown basis ${String(fields.basis)}`);
        for (const k of allowed) if (k in fields) (st as unknown as Record<string, unknown>)[k] = (fields as Record<string, unknown>)[k];
        st.status = "open";
        bumpBlueprint(ctx, bp, `Edited ${st.contractId}`, [st.contractId]);
        break;
      }
      case "CONFIRM_STEP": {
        const st = find(sid);
        st.status = (p.status as WorkflowStep["status"]) ?? "confirmed";
        bumpBlueprint(ctx, bp, `${st.contractId} structure ${st.status}`, [], false);
        break;
      }
      case "CONFIRM_ALL_STEPS": {
        activeSteps(bp).forEach((x) => (x.status = "confirmed"));
        bumpBlueprint(ctx, bp, "All step structures confirmed", [], false);
        break;
      }
      case "ARCHIVE_STEP": {
        const st = find(sid);
        st.archived = true;
        bumpBlueprint(ctx, bp, `Archived ${st.contractId}`, [st.contractId]);
        break;
      }
      case "RESTORE_STEP": {
        const st = find(sid);
        st.archived = false;
        bumpBlueprint(ctx, bp, `Restored ${st.contractId}`, [st.contractId]);
        break;
      }
      case "MOVE_STEP": {
        const st = find(sid);
        const dir = p.direction === "up" ? -1 : 1;
        const ordered = activeSteps(bp);
        const i = ordered.findIndex((x) => x.contractId === st.contractId);
        const j = i + dir;
        pre(j >= 0 && j < ordered.length, "Cannot move beyond bounds");
        const tmp = ordered[i].seq;
        ordered[i].seq = ordered[j].seq;
        ordered[j].seq = tmp;
        if (typeof p.phase === "string") st.phase = p.phase;
        resequence(bp);
        bumpBlueprint(ctx, bp, `Moved ${st.contractId}`, [st.contractId], false);
        break;
      }
      case "ADD_RULE": {
        const st = find(sid);
        const r = p.rule as Partial<Rule>;
        str(r?.statement, "rule.statement");
        st.rules.push(normalizeRule(r, nextRuleId(st)));
        bumpBlueprint(ctx, bp, `Rule added to ${st.contractId}`, [st.contractId]);
        break;
      }
      case "SET_RULE": {
        const st = find(sid);
        const r = st.rules.find((x) => x.ruleId === p.ruleId);
        if (!r) throw new ActionError("NOT_FOUND", `Rule ${String(p.ruleId)} not found`);
        const f = (p.fields as Partial<Rule>) ?? {};
        if (f.statement) r.statement = f.statement;
        if (f.ruleType) r.ruleType = f.ruleType;
        if (typeof f.hardStop === "boolean") r.hardStop = f.hardStop;
        if (f.basis && BASIS_VALUES.includes(f.basis)) r.basis = f.basis;
        if (f.provenance) r.provenance = { ...r.provenance, ...f.provenance };
        bumpBlueprint(ctx, bp, `Rule ${r.ruleId} updated`, f.statement || typeof f.hardStop === "boolean" ? [st.contractId] : [], !!(f.statement || typeof f.hardStop === "boolean"));
        break;
      }
      case "ADD_CHECK": {
        const st = find(sid);
        const c = (p.check as Partial<Check>) ?? {};
        const nums = st.checks.map((x) => Number(x.checkId.split("-C").pop()) || 0);
        const checkId = `${st.contractId}-C${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
        st.checks.push(normalizeCheck({ ...c, checkId, execution: { stepId: st.contractId, persona: c.execution?.persona ?? st.owner, point: c.execution?.point ?? "During step" } }, st));
        bumpBlueprint(ctx, bp, `Check ${checkId} added`, [st.contractId]);
        ctx.data = { checkId };
        break;
      }
      case "SET_CHECK": {
        const st = find(sid);
        const c = st.checks.find((x) => x.checkId === p.checkId);
        if (!c) throw new ActionError("NOT_FOUND", `Check ${String(p.checkId)} not found`);
        const f = (p.fields as Partial<Check>) ?? {};
        const structural = ["expectedResult", "passAction", "failAction", "output", "supportsDecisionStepIds", "logicType", "writebackAction"].some((k) => k in f);
        Object.assign(c, f, { checkId: c.checkId, execution: { ...c.execution, ...(f.execution ?? {}), stepId: st.contractId } });
        if (structural) c.reviewStatus = "open";
        bumpBlueprint(ctx, bp, `Check ${c.checkId} updated`, structural ? [st.contractId] : [], structural);
        break;
      }
      case "CONFIRM_CHECK": {
        const st = find(sid);
        const c = st.checks.find((x) => x.checkId === p.checkId);
        if (!c) throw new ActionError("NOT_FOUND", `Check ${String(p.checkId)} not found`);
        c.reviewStatus = (p.status as Check["reviewStatus"]) ?? "confirmed";
        bumpBlueprint(ctx, bp, `Check ${c.checkId} ${c.reviewStatus}`, [], false);
        break;
      }
      case "CONFIRM_ALL_CHECKS": {
        activeSteps(bp).forEach((x) => x.checks.forEach((c) => (c.reviewStatus = "confirmed")));
        bumpBlueprint(ctx, bp, "All checks confirmed", [], false);
        break;
      }
      case "ADD_ACTION": {
        const st = find(sid);
        const a = (p.action as Partial<HumanAction>) ?? {};
        const nums = st.humanActions.map((x) => Number(x.actionId.split("-A").pop()) || 0);
        const actionId = `${st.contractId}-A${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
        st.humanActions.push(normalizeAction({ ...a, actionId }));
        st.noHumanDecision = false;
        st.noHumanDecisionReason = "";
        bumpBlueprint(ctx, bp, `Human action ${actionId} added`, [st.contractId]);
        ctx.data = { actionId };
        break;
      }
      case "SET_ACTION": {
        const st = find(sid);
        const a = st.humanActions.find((x) => x.actionId === p.actionId);
        if (!a) throw new ActionError("NOT_FOUND", `Action ${String(p.actionId)} not found`);
        Object.assign(a, (p.fields as Partial<HumanAction>) ?? {}, { actionId: a.actionId });
        a.routingMode = a.targetStepId === "DYNAMIC_AFFECTED_STEP" ? "DYNAMIC_AFFECTED_STEP" : "FIXED_STEP";
        a.reviewStatus = "open";
        bumpBlueprint(ctx, bp, `Human action ${a.actionId} updated`, [st.contractId]);
        break;
      }
      case "CONFIRM_ACTION": {
        const st = find(sid);
        const a = st.humanActions.find((x) => x.actionId === p.actionId);
        if (!a) throw new ActionError("NOT_FOUND", `Action ${String(p.actionId)} not found`);
        a.reviewStatus = (p.status as HumanAction["reviewStatus"]) ?? "confirmed";
        bumpBlueprint(ctx, bp, `Human action ${a.actionId} ${a.reviewStatus}`, [], false);
        break;
      }
      case "CONFIRM_ALL_ACTIONS": {
        activeSteps(bp).forEach((x) => x.humanActions.forEach((a) => (a.reviewStatus = "confirmed")));
        bumpBlueprint(ctx, bp, "All human actions confirmed", [], false);
        break;
      }
      case "SET_HUMAN_DECISION": {
        // Explicit statement that nobody decides at this step. Does not reopen the structure review; a later human action clears it.
        const st = find(sid);
        st.noHumanDecision = p.noHumanDecision === true;
        st.noHumanDecisionReason = st.noHumanDecision ? str(p.reason, "reason") : "";
        bumpBlueprint(ctx, bp, st.noHumanDecision ? `${st.contractId}: no human decision at this step` : `${st.contractId}: human decision expected`, [], false);
        break;
      }
      case "SET_AUTHORITY": {
        const st = find(sid);
        st.authority = { ...st.authority, ...((p.authority as Partial<WorkflowStep["authority"]>) ?? {}) };
        bumpBlueprint(ctx, bp, `Authority set on ${st.contractId}`, [], false);
        break;
      }
      case "SET_IMPLEMENTATION": {
        const st = find(sid);
        const f = (p.implementation as Partial<WorkflowStep["implementation"]>) ?? {};
        st.implementation = { ...st.implementation, ...f, currentState: { ...st.implementation.currentState, ...(f.currentState ?? {}) }, targetState: { ...st.implementation.targetState, ...(f.targetState ?? {}) }, arbImpact: { ...st.implementation.arbImpact, ...(f.arbImpact ?? {}) } };
        bumpBlueprint(ctx, bp, `Implementation assessment set on ${st.contractId}`, [], false);
        break;
      }
      case "SET_CURRENT_AI": {
        const item = p.item as Partial<Blueprint["currentAi"][number]>;
        pre(item, "payload.item required");
        const existing = bp.currentAi.find((x) => x.id === item.id);
        if (existing) Object.assign(existing, item, { id: existing.id });
        else bp.currentAi.push({ id: item.id ?? `AI-${String(bp.currentAi.length + 1).padStart(3, "0")}`, category: item.category ?? "", capability: item.capability ?? "", currentPosition: item.currentPosition ?? "", treatment: item.treatment ?? "TO_CONFIRM", why: item.why ?? "", evidenceStatus: item.evidenceStatus ?? "TO_CONFIRM", reviewStatus: item.reviewStatus ?? "open", workflowRefs: item.workflowRefs ?? [] });
        bumpBlueprint(ctx, bp, `Current AI inventory updated`, [], false);
        break;
      }
      case "CONFIRM_ALL_CURRENT_AI": {
        bp.currentAi.forEach((x) => (x.reviewStatus = "confirmed"));
        bumpBlueprint(ctx, bp, "Current AI inventory confirmed", [], false);
        break;
      }
      default:
        throw new ActionError("INVALID_REQUEST", `Unknown blueprint op ${op}`);
    }
    ctx.message = ctx.message || `Blueprint ${op} applied.`;
  },

  SET_VALUE_NORTH_STAR(ctx) {
    const s = ctx.state;
    const v = (ctx.req.payload?.valueNorthStar as Partial<FactoryState["valueNorthStar"]>) ?? {};
    const confirm = ctx.req.payload?.confirm === true;
    if (confirm) {
      const auth = actorMayDecide(ctx.req.actor, ["CLIENT_BUSINESS_OWNER", "CLIENT_PROCESS_OWNER"]);
      if (!auth.ok) throw new ActionError("UNAUTHORIZED", `Value North Star confirmation: ${auth.reason}`);
    }
    s.valueNorthStar = { ...s.valueNorthStar, ...v, reviewStatus: confirm ? "CONFIRMED" : v.reviewStatus === "CONFIRMED" && !confirm ? "OPEN" : "OPEN" };
    if (confirm) recordDecision(s, { decisionId: nextId(s, "DEC"), type: "APPROVE", target: { type: "VALUE_NORTH_STAR", id: "valueNorthStar" }, actor: ctx.req.actor, rationale: String(ctx.req.reason ?? "Value North Star confirmed"), at: ctx.at }, s.currentStage);
    const bp = getBlueprint(s);
    if (bp) {
      bp.valueNorthStar = s.valueNorthStar;
      s.artifactContent[CONTENT_KEYS.blueprint] = bp;
    }
    ctx.events.push({ type: confirm ? "DECISION_RECORDED" : "WORKFLOW_CHANGED", summary: confirm ? "Value North Star confirmed" : "Value North Star updated" });
    ctx.message = confirm ? "Value North Star confirmed." : "Value North Star updated (unconfirmed).";
  },

  /**
   * Enterprise context: the client's standards, systems, integration patterns, data domains, security constraints and AI policy.
   * Any authorized role edits it; only the client architect (or delivery lead on their behalf) confirms it. Editing reopens it.
   */
  SET_ENTERPRISE_CONTEXT(ctx) {
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    const cur = clone(getEnterpriseContext(s));
    const confirm = p.confirm === true;
    const op = typeof p.op === "string" ? p.op : confirm ? "CONFIRM" : "MERGE";
    let changed = false;
    if (op === "MERGE" || op === "REPLACE") {
      const incoming = (p.enterpriseContext as Partial<EnterpriseContext>) ?? {};
      for (const k of ENTERPRISE_SECTIONS) {
        if (!Array.isArray(incoming[k])) continue;
        const rows = (incoming[k] as Partial<EnterpriseEntry>[]).map((e) => normalizeEnterpriseEntry(e, s));
        cur[k] = op === "REPLACE" ? rows : [...cur[k], ...rows];
        changed = true;
      }
      if (typeof incoming.summary === "string") { cur.summary = incoming.summary; changed = true; }
      if (Array.isArray(incoming.gaps)) { cur.gaps = op === "REPLACE" ? incoming.gaps.map(String) : [...cur.gaps, ...incoming.gaps.map(String)]; changed = true; }
    } else if (op === "REMOVE_ENTRY") {
      const id = str(p.entryId, "entryId");
      for (const k of ENTERPRISE_SECTIONS) {
        const before = cur[k].length;
        cur[k] = cur[k].filter((e) => e.id !== id);
        if (cur[k].length !== before) changed = true;
      }
      pre(changed, `Entry ${id} not found`);
    } else if (op === "SET_ENTRY") {
      const id = str(p.entryId, "entryId");
      const fields = (p.fields as Partial<EnterpriseEntry>) ?? {};
      for (const k of ENTERPRISE_SECTIONS) {
        const e = cur[k].find((x) => x.id === id);
        if (e) { Object.assign(e, normalizeEnterpriseEntry({ ...e, ...fields, id }, s)); changed = true; }
      }
      pre(changed, `Entry ${id} not found`);
    } else if (op !== "CONFIRM") throw new ActionError("INVALID_REQUEST", `Unknown enterprise context op ${op}`);
    if (changed) {
      cur.version += 1;
      cur.reviewStatus = "OPEN";
      delete cur.confirmedBy;
    }
    if (confirm) {
      pre(enterpriseEntryCount(cur) > 0, "Nothing to confirm: the enterprise context is empty");
      const auth = actorMayDecide(ctx.req.actor, ["CLIENT_ARCHITECT", "CLIENT_IT_OPERATIONS", "SECURITY_PRIVACY"]);
      if (!auth.ok) throw new ActionError("UNAUTHORIZED", `Enterprise context confirmation: ${auth.reason}`);
      const decisionId = nextId(s, "DEC");
      recordDecision(s, { decisionId, type: "APPROVE", target: { type: "ARTIFACT", id: "enterprise-context" }, actor: ctx.req.actor, rationale: String(ctx.req.reason ?? "Enterprise context confirmed as the grounding for workflow design"), at: ctx.at }, s.currentStage);
      cur.reviewStatus = "CONFIRMED";
      cur.confirmedBy = { actor: ctx.req.actor, at: ctx.at, decisionId };
    }
    cur.updatedAt = ctx.at;
    s.enterpriseContext = cur;
    ctx.events.push({ type: confirm ? "DECISION_RECORDED" : "WORKFLOW_CHANGED", summary: confirm ? `Enterprise context v${cur.version} confirmed` : `Enterprise context updated (${op}, v${cur.version})` });
    ctx.message = confirm ? "Enterprise context confirmed." : "Enterprise context updated (unconfirmed).";
    ctx.data = { version: cur.version, reviewStatus: cur.reviewStatus };
  },

  SET_EXPERIENCE(ctx) {
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    pre(s.currentStage === "EXPERIENCE", "Not in EXPERIENCE stage");
    if (Array.isArray(p.notes)) {
      s.experience.notes = (p.notes as Partial<FactoryState["experience"]["notes"][number]>[]).map((n, i) => ({ noteId: n.noteId ?? `EXP-NOTE-${String(i + 1).padStart(3, "0")}`, classification: n.classification ?? "TO_CONFIRM", statement: n.statement ?? "", evidenceRefs: n.evidenceRefs ?? [], affectsGovernance: !!n.affectsGovernance }));
      if (s.experience.substage === "EXPERIENCE_EVIDENCE_INTAKE") s.experience.substage = "EXPERIENCE_BASELINE_PROFILE";
    }
    if (typeof p.substage === "string") s.experience.substage = p.substage as FactoryState["experience"]["substage"];
    ctx.events.push({ type: "STAGE_EXECUTION_CHANGED", summary: `Experience sub-stage ${s.experience.substage}` });
    ctx.message = "Experience state updated.";
  },

  GENERATE_EXPERIENCE(ctx) {
    const s = ctx.state;
    pre(s.currentStage === "EXPERIENCE", "Not in EXPERIENCE stage");
    const governanceNotes = s.experience.notes.filter((n) => n.affectsGovernance);
    pre(governanceNotes.length === 0, `Experience notes affect workflow/authority/data: ${governanceNotes.map((n) => n.noteId).join(", ")} — route through governance (change the design) before generating`);
    const bp = requireBlueprint(ctx);
    const pack = { sourceWorkflowVersion: bp.version, notes: s.experience.notes, screens: activeSteps(bp).map((st) => ({ stepId: st.contractId, title: st.name, persona: st.owner, nextAction: st.humanActions[0]?.name ?? "Review", aiAssist: st.aiRole })) };
    s.artifactContent[CONTENT_KEYS.experiencePack] = pack;
    const art = registerArtifact(s, { kind: "EXPERIENCE_PACK", title: "Experience Pack", version: `${bp.version}-xp1`, producedBy: "CONTROL_PLANE", contentKey: CONTENT_KEYS.experiencePack, summary: `${pack.screens.length} screens derived from approved design`, evidenceClass: "DERIVED" }, ctx.at);
    s.experience.generatedPackArtifactId = art.artifactId;
    s.experience.substage = "EXPERIENCE_REVIEW";
    s.experience.reviewOutcome = "NOT_REVIEWED";
    ctx.events.push({ type: "ARTIFACT_REGISTERED", summary: `Experience pack ${art.artifactId} ready for review`, refs: [art.artifactId] });
    ctx.message = "Experience pack generated; ready for review.";
  },

  SET_INTEGRATION_CONTRACT(ctx) {
    const s = ctx.state;
    const c = ctx.req.payload?.contract as IntegrationDataContract | undefined;
    pre(c && Array.isArray(c.integrations), "payload.contract required");
    const prev = getIntegrationContract(s);
    const contract: IntegrationDataContract = { ...c, schema: "ai-delivery-integration-data-contract-v1", version: prev ? bumpVersion(prev.version) : "0.1.0", integrations: c.integrations.map((i) => ({ ...i, readinessHistory: i.readinessHistory ?? [{ from: null, to: i.readiness, at: ctx.at, by: ctx.req.actor.userId }] })) };
    s.artifactContent[CONTENT_KEYS.integrationContract] = contract;
    registerArtifact(s, { kind: "INTEGRATION_DATA_CONTRACT", title: "Integration & Data Contract", version: contract.version, producedBy: ctx.req.actor.role === "AI_SPECIALIST" ? "AI_SPECIALIST" : "HUMAN", contentKey: CONTENT_KEYS.integrationContract, summary: `${contract.integrations.length} integrations, ${contract.data.length} data contracts` }, ctx.at);
    evaluateGates(ctx);
    ctx.events.push({ type: "ARCHITECTURE_UPDATED", summary: `Integration & Data Contract v${contract.version}` });
    ctx.message = "Integration & Data Contract registered.";
  },

  UPDATE_INTEGRATION(ctx) {
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    const contract = getIntegrationContract(s);
    pre(contract, "No Integration & Data Contract");
    const i = contract.integrations.find((x) => x.integrationId === p.integrationId);
    if (!i) throw new ActionError("NOT_FOUND", `Integration ${String(p.integrationId)} not found`);
    if (typeof p.readiness === "string") {
      const to = p.readiness as ReadinessState;
      const t = canTransition(i.readiness, to);
      pre(t.ok, t.reason);
      if (["CONNECTED", "CONTRACT_TESTED", "END_TO_END_VERIFIED"].includes(to)) {
        const ref = typeof p.evidenceRef === "string" ? p.evidenceRef : "";
        const rec = s.evidenceCatalog.find((e) => e.evidenceRef === ref && e.authorityStatus === "CURRENT");
        pre(rec, `Readiness ${to} requires an evidenceRef to a current evidence record`);
        pre(!rec.synthetic, `Synthetic evidence cannot advance ${i.integrationId} to ${to}`);
        i.evidenceRefs.push(ref);
        if (to === "END_TO_END_VERIFIED") i.runtimeVerification = ref;
      }
      i.readinessHistory.push({ from: i.readiness, to, at: ctx.at, evidenceRef: typeof p.evidenceRef === "string" ? p.evidenceRef : undefined, by: ctx.req.actor.userId });
      i.readiness = to;
    }
    const fields = (p.fields as Partial<typeof i>) ?? {};
    Object.assign(i, fields, { integrationId: i.integrationId, readiness: i.readiness, readinessHistory: i.readinessHistory });
    contract.version = bumpVersion(contract.version);
    s.artifactContent[CONTENT_KEYS.integrationContract] = contract;
    const art = currentArtifact(s, "INTEGRATION_DATA_CONTRACT");
    if (art) art.version = contract.version;
    evaluateGates(ctx);
    ctx.events.push({ type: "ARCHITECTURE_UPDATED", summary: `${i.integrationId} → ${i.readiness}` });
    ctx.message = `${i.integrationId} updated.`;
  },

  SET_OBSERVABILITY(ctx) {
    const s = ctx.state;
    const o = (ctx.req.payload?.observability as Partial<FactoryState["itObservability"]>) ?? {};
    s.itObservability = { ...s.itObservability, ...o };
    if (o.inheritsClientEcosystem === false && !s.itObservability.newParallelPlatformDecisionId) {
      const dec = recordDecision(s, { decisionId: nextId(s, "DEC"), type: "APPROVE", target: { type: "ARTIFACT", id: "observability-platform" }, actor: ctx.req.actor, rationale: String(ctx.req.reason ?? "Parallel telemetry platform decision"), at: ctx.at }, s.currentStage);
      const auth = actorMayDecide(ctx.req.actor, ["CLIENT_ARCHITECT", "ARB"]);
      if (!auth.ok) throw new ActionError("UNAUTHORIZED", `A new telemetry platform requires an architecture decision: ${auth.reason}`);
      s.itObservability.newParallelPlatformDecisionId = dec.decisionId;
    }
    evaluateGates(ctx);
    ctx.events.push({ type: "ARCHITECTURE_UPDATED", summary: "Observability alignment updated" });
    ctx.message = "Observability updated.";
  },

  COMPILE_TECHNICAL_DESIGN(ctx) {
    const s = ctx.state;
    const bp = requireBlueprint(ctx);
    pre(["TECHNICAL_DESIGN", "TRANSFORMATION_PLANNING", "BUILD_CONTRACT"].includes(s.currentStage), "Technical design compiles from TECHNICAL_DESIGN onward");
    const td = compileTechnicalDesign(bp, getIntegrationContract(s), s.itObservability, ctx.at);
    const prev = getTechnicalDesign(s);
    if (prev) td.version = bumpVersion(prev.version);
    const enrichment = ctx.req.payload?.aiEnrichment as { specialistId: string; recommendationRef: string; notes: string[] } | undefined;
    if (enrichment) td.aiEnrichment = enrichment;
    s.artifactContent[CONTENT_KEYS.technicalDesign] = td;
    const art = registerArtifact(s, { kind: "CONTROLLED_TECHNICAL_DESIGN", title: "Controlled Technical Design", version: td.version, producedBy: "DETERMINISTIC_SERVICE", upstream: [{ artifactId: currentArtifact(s, "DESIGN_CONTRACT")?.artifactId ?? "", version: bp.version }, { artifactId: currentArtifact(s, "INTEGRATION_DATA_CONTRACT")?.artifactId ?? "", version: td.sourceIntegrationContractVersion }], contentKey: CONTENT_KEYS.technicalDesign, summary: `${td.components.length} components, ${td.agents.length} agents, ${td.openDecisions.length} open decisions` }, ctx.at);
    for (const a of td.agents) ctx.events.push({ type: "AGENT_PROPOSED", summary: `${a.agentId} ${a.name} (${a.reuseDisposition})`, refs: [a.agentId] });
    evaluateGates(ctx);
    ctx.events.push({ type: "ARCHITECTURE_UPDATED", summary: `Technical design ${art.artifactId} v${td.version}`, refs: [art.artifactId] });
    ctx.message = `Technical design compiled (${td.openDecisions.length} open decisions).`;
  },

  SET_TRANSFORMATION_PLAN(ctx) {
    const s = ctx.state;
    const plan = ctx.req.payload?.plan as TransformationPlan | undefined;
    pre(plan && Array.isArray(plan.workPackages), "payload.plan required");
    const bp = requireBlueprint(ctx);
    const td = getTechnicalDesign(s);
    const full: TransformationPlan = { ...plan, schema: "ai-delivery-transformation-plan-v1", version: plan.version ?? "0.1.0", sourceWorkflowVersion: bp.version, sourceTechnicalDesignVersion: td?.version ?? "NONE", economics: plan.economics ?? { provided: false, note: "No economics requested" } };
    s.artifactContent[CONTENT_KEYS.transformationPlan] = full;
    registerArtifact(s, { kind: "TRANSFORMATION_PLAN", title: "Transformation Plan", version: full.version, producedBy: ctx.req.actor.role === "AI_SPECIALIST" ? "AI_SPECIALIST" : "HUMAN", contentKey: CONTENT_KEYS.transformationPlan, summary: `${full.workPackages.length} work packages` }, ctx.at);
    evaluateGates(ctx);
    ctx.events.push({ type: "ARTIFACT_REGISTERED", summary: `Transformation plan v${full.version}` });
    ctx.message = "Transformation plan registered.";
  },

  GENERATE_BUILD_CONTRACT(ctx) {
    const s = ctx.state;
    pre(["BUILD_CONTRACT", "IMPLEMENTATION_READINESS"].includes(s.currentStage), "Build contract generates in BUILD_CONTRACT");
    const bp = requireBlueprint(ctx);
    const td = getTechnicalDesign(s);
    pre(td, "Technical design required before the Build Contract");
    const idc = getIntegrationContract(s);
    const bc = generateBuildContract(bp, { technical: td.version, integration: idc?.version ?? "NONE" }, idc, ctx.at);
    s.artifactContent[CONTENT_KEYS.buildContract] = bc;
    registerArtifact(s, { kind: "BUILD_CONTRACT", title: "Build Contract", version: bc.version, producedBy: "DETERMINISTIC_SERVICE", upstream: [{ artifactId: currentArtifact(s, "CONTROLLED_TECHNICAL_DESIGN")?.artifactId ?? "", version: td.version }], contentKey: CONTENT_KEYS.buildContract, summary: `${bc.units.length} build units + CI unit` }, ctx.at);
    evaluateGates(ctx);
    ctx.events.push({ type: "BUILD_CONTRACT_GENERATED", summary: `Build contract v${bc.version} (${bc.units.length} units)` });
    ctx.message = "Build contract generated.";
  },

  REGISTER_REALIZATION_PLAN(ctx) {
    const s = ctx.state;
    const rp = ctx.req.payload?.plan as RepositoryRealizationPlan | undefined;
    pre(rp && Array.isArray(rp.conflicts), "payload.plan required");
    const bc = getBuildContract(s);
    pre(bc, "No Build Contract");
    pre(rp.buildContractVersion === bc.version, `Realization plan targets contract ${rp.buildContractVersion}; current is ${bc.version}`);
    s.artifactContent[CONTENT_KEYS.realizationPlan] = { ...rp, schema: "ai-delivery-repository-realization-plan-v1", submittedAt: ctx.at, conflicts: rp.conflicts.map((c) => ({ ...c, status: c.status === "RESOLVED" ? "RESOLVED" : "RETURNED_TO_FACTORY" })) };
    registerArtifact(s, { kind: "REPOSITORY_REALIZATION_PLAN", title: "Repository Realization Plan", version: `${bc.version}-rrp`, producedBy: "HUMAN", contentKey: CONTENT_KEYS.realizationPlan, summary: `${rp.conflicts.length} conflict(s) returned to the Factory` }, ctx.at);
    for (const [i, c] of rp.conflicts.entries()) {
      if (c.status !== "RESOLVED") s.pendingHumanDecisions.push({ requestId: nextId(s, "REQ"), title: `Repository conflict on ${c.unitId}`, question: c.description, stage: s.currentStage, target: { type: "BUILD_CONTRACT", id: `${c.unitId}#${i}` }, allowedRoles: ["CLIENT_ARCHITECT", "DELIVERY_LEAD"], allowedTypes: ["CORRECT", "REJECT"], requestedAt: ctx.at, requestedBy: "HUMAN", status: "PENDING" });
    }
    evaluateGates(ctx);
    ctx.events.push({ type: "ARTIFACT_REGISTERED", summary: `Repository Realization Plan registered (${rp.conflicts.length} conflicts)` });
    ctx.message = "Repository Realization Plan registered.";
  },

  RUN_VALIDATION(ctx) {
    const s = ctx.state;
    const bc = getBuildContract(s);
    pre(bc, "No Build Contract to validate against");
    const report = validateImplementation(bc, s.evidenceCatalog, ctx.at);
    s.artifactContent[CONTENT_KEYS.validationReport] = report;
    registerArtifact(s, { kind: "CODE_VALIDATION_REPORT", title: "Code Validation Report", version: report.version, producedBy: "DETERMINISTIC_SERVICE", upstream: [{ artifactId: currentArtifact(s, "BUILD_CONTRACT")?.artifactId ?? "", version: bc.version }], contentKey: CONTENT_KEYS.validationReport, summary: `PASS ${report.summary.PASS} · PARTIAL ${report.summary.PARTIAL} · GAP ${report.summary.GAP} · FAIL ${report.summary.FAIL} · NOT_ASSESSED ${report.summary.NOT_ASSESSED}`, evidenceClass: "REAL" }, ctx.at);
    recompute(ctx);
    evaluateGates(ctx);
    ctx.events.push({ type: "VALIDATION_COMPLETED", summary: `Validation ${report.summary.FAIL ? "failed" : "completed"}: ${report.units.length} units` });
    ctx.message = `Validation report generated.`;
  },

  CREATE_SIMULATION(ctx) {
    const s = ctx.state;
    const mode = ctx.req.payload?.mode as SimulationMode;
    pre(SIMULATION_MODES.includes(mode), "payload.mode must be a simulation mode");
    const bp = requireBlueprint(ctx);
    const packId = nextId(s, "SIM");
    const pack = createPack(bp, mode, s.stateRevision, packId, getBuildContract(s));
    const packs = getSimulationPacks(s);
    packs[packId] = pack;
    s.artifactContent[CONTENT_KEYS.simulationPacks] = packs;
    const job = { jobId: nextId(s, "JOB"), engagementId: s.engagement_id, jobType: "SIMULATION" as const, sourceStateRevision: s.stateRevision, sourceArtifactVersions: [{ artifactId: currentArtifact(s, "WORKFLOW_BLUEPRINT")?.artifactId ?? "", version: bp.version }], status: "QUEUED" as const, batch: { total: pack.scenarios.length, completed: 0, unitIds: pack.scenarios.map((x) => x.scenarioId) }, nextUnit: pack.scenarios[0]?.scenarioId, resultArtifactRefs: [packId], invalidatedBy: [], queuedAt: ctx.at, updatedAt: ctx.at, telemetry: { modelCalls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, retries: 0, cacheReadTokens: 0 } };
    s.jobs.push(job);
    registerArtifact(s, { kind: "SIMULATION_PACK", title: `Simulation pack ${mode}`, version: `${bp.version}-${packId}`, producedBy: "DETERMINISTIC_SERVICE", contentKey: CONTENT_KEYS.simulationPacks, summary: `${pack.scenarios.length} scenarios · SYNTHETIC_SIMULATION`, evidenceClass: "SYNTHETIC_SIMULATION", authority: "REFERENCE_ONLY" }, ctx.at);
    ctx.events.push({ type: "SIMULATION_STARTED", summary: `${packId} ${mode} queued with ${pack.scenarios.length} scenarios`, refs: [packId, job.jobId] });
    ctx.message = `Simulation pack ${packId} created with ${pack.scenarios.length} scenarios.`;
    ctx.data = { packId, jobId: job.jobId };
  },

  RUN_SIMULATION_BATCH(ctx) {
    const s = ctx.state;
    const packId = str(ctx.req.payload?.packId, "packId");
    const limit = typeof ctx.req.payload?.limit === "number" ? (ctx.req.payload!.limit as number) : Infinity;
    const packs = getSimulationPacks(s);
    const pack = packs[packId];
    if (!pack) throw new ActionError("NOT_FOUND", `Simulation pack ${packId} not found`);
    const job = s.jobs.find((j) => j.resultArtifactRefs.includes(packId));
    pre(!job || job.status !== "INTERRUPTED", `Job ${job?.jobId} is INTERRUPTED; resume it first`);
    const bp = requireBlueprint(ctx);
    const next = runBatch(pack, bp, getBuildContract(s), ctx.at, limit);
    packs[packId] = next;
    s.artifactContent[CONTENT_KEYS.simulationPacks] = packs;
    if (job) {
      job.status = next.batch.status === "COMPLETE" ? "COMPLETE" : "CHECKPOINTED";
      job.batch.completed = next.batch.completed;
      job.nextUnit = next.batch.nextUnit;
      job.lastCheckpoint = { at: ctx.at, unitId: next.batch.nextUnit ?? "END", completed: next.batch.completed };
      job.updatedAt = ctx.at;
    }
    ctx.events.push({ type: next.batch.status === "COMPLETE" ? "SIMULATION_COMPLETED" : "SIMULATION_CHECKPOINTED", summary: `${packId}: ${next.batch.completed}/${next.batch.total} scenarios (SYNTHETIC_SIMULATION)`, refs: [packId] });
    ctx.message = `${next.batch.completed}/${next.batch.total} scenarios complete.`;
  },

  RECORD_SIMULATION_FEEDBACK(ctx) {
    const s = ctx.state;
    const packId = str(ctx.req.payload?.packId, "packId");
    const scenarioId = str(ctx.req.payload?.scenarioId, "scenarioId");
    const value = ctx.req.payload?.value as BusinessFeedback;
    pre(["CONFIRMS_DESIGN", "NEEDS_CHANGE", "UNSURE"].includes(value), "value must be CONFIRMS_DESIGN | NEEDS_CHANGE | UNSURE");
    const packs = getSimulationPacks(s);
    const run = packs[packId]?.runs[scenarioId];
    if (!run) throw new ActionError("NOT_FOUND", `No run for ${scenarioId} in ${packId}`);
    run.feedback = { value, by: `${ctx.req.actor.role}:${ctx.req.actor.userId}`, note: String(ctx.req.payload?.note ?? ""), at: ctx.at };
    s.artifactContent[CONTENT_KEYS.simulationPacks] = packs;
    if (value === "NEEDS_CHANGE") {
      const sc = packs[packId].scenarios.find((x) => x.scenarioId === scenarioId)!;
      s.openItems.push({ itemId: nextId(s, "OPN"), kind: "QUESTION", title: `Simulation feedback: ${sc.title}`, detail: String(ctx.req.payload?.note ?? "Business reviewer flagged NEEDS_CHANGE"), owner: "Consultant", stage: s.currentStage, relatedIds: [sc.stepId, scenarioId], status: "OPEN", raisedAt: ctx.at });
    }
    ctx.events.push({ type: "DECISION_RECORDED", summary: `Feedback ${value} on ${scenarioId} (design-review evidence, not approval)`, refs: [scenarioId] });
    ctx.message = "Feedback recorded as synthetic design-review evidence.";
  },

  QUEUE_JOB(ctx) {
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    const jobType = str(p.jobType, "jobType") as FactoryState["jobs"][number]["jobType"];
    const job = { jobId: nextId(s, "JOB"), engagementId: s.engagement_id, jobType, specialistId: typeof p.specialistId === "string" ? p.specialistId : undefined, sourceStateRevision: s.stateRevision, sourceArtifactVersions: s.authoritativeArtifacts.filter((a) => a.authority === "CURRENT_AUTHORITATIVE").map((a) => ({ artifactId: a.artifactId, version: a.version })), status: "QUEUED" as const, batch: { total: 1, completed: 0, unitIds: ["unit-1"] }, nextUnit: "unit-1", resultArtifactRefs: [], invalidatedBy: [], queuedAt: ctx.at, updatedAt: ctx.at, telemetry: { modelCalls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, retries: 0, cacheReadTokens: 0 } };
    s.jobs.push(job);
    ctx.events.push({ type: "JOB_QUEUED", summary: `${job.jobId} ${jobType}${job.specialistId ? ` (${job.specialistId})` : ""}`, refs: [job.jobId] });
    ctx.message = `${job.jobId} queued.`;
    ctx.data = { jobId: job.jobId };
  },

  START_JOB(ctx) {
    const job = findJob(ctx);
    pre(["QUEUED", "CHECKPOINTED", "INTERRUPTED"].includes(job.status), `Job is ${job.status}`);
    job.status = "RUNNING";
    job.updatedAt = ctx.at;
    ctx.events.push({ type: "JOB_QUEUED", summary: `${job.jobId} running`, refs: [job.jobId] });
    ctx.message = `${job.jobId} running.`;
  },

  CHECKPOINT_JOB(ctx) {
    const job = findJob(ctx);
    const unitId = str(ctx.req.payload?.unitId, "unitId");
    job.batch.completed = Math.min(job.batch.total, job.batch.completed + 1);
    job.lastCheckpoint = { at: ctx.at, unitId, completed: job.batch.completed };
    job.nextUnit = job.batch.unitIds[job.batch.completed];
    job.status = "CHECKPOINTED";
    job.updatedAt = ctx.at;
    ctx.events.push({ type: "JOB_CHECKPOINTED", summary: `${job.jobId} checkpoint at ${unitId}`, refs: [job.jobId] });
    ctx.message = `${job.jobId} checkpointed.`;
  },

  INTERRUPT_JOB(ctx) {
    const job = findJob(ctx);
    pre(["RUNNING", "CHECKPOINTED", "QUEUED"].includes(job.status), `Job is ${job.status}`);
    job.status = "INTERRUPTED";
    job.updatedAt = ctx.at;
    job.error = String(ctx.req.reason ?? "Interrupted (usage/session cap or operator)");
    ctx.events.push({ type: "JOB_INTERRUPTED", summary: `${job.jobId} interrupted — not a failure; resumable from ${job.lastCheckpoint?.unitId ?? "start"}`, refs: [job.jobId] });
    ctx.message = `${job.jobId} interrupted; governed work preserved.`;
  },

  RESUME_JOB(ctx) {
    const s = ctx.state;
    const job = findJob(ctx);
    pre(["INTERRUPTED", "CHECKPOINTED"].includes(job.status), `Job is ${job.status}`);
    const changed = job.sourceArtifactVersions.filter((v) => {
      const cur = s.authoritativeArtifacts.find((a) => a.artifactId === v.artifactId);
      return cur && cur.version !== v.version;
    });
    if (changed.length) {
      job.invalidatedBy = changed.map((c) => c.artifactId);
      ctx.events.push({ type: "JOB_INTERRUPTED", summary: `${job.jobId}: upstream ${changed.map((c) => c.artifactId).join(", ")} changed; affected units will be redone`, refs: [job.jobId] });
    }
    job.status = "RUNNING";
    job.error = undefined;
    job.updatedAt = ctx.at;
    ctx.events.push({ type: "ENGAGEMENT_RESUMED", summary: `${job.jobId} resumed at ${job.nextUnit ?? "start"} (${job.batch.completed}/${job.batch.total} already complete)`, refs: [job.jobId] });
    ctx.message = `${job.jobId} resumed from checkpoint.`;
  },

  COMPLETE_JOB(ctx) {
    const s = ctx.state;
    const job = findJob(ctx);
    const p = ctx.req.payload ?? {};
    job.status = "COMPLETE";
    job.batch.completed = job.batch.total;
    job.nextUnit = undefined;
    job.updatedAt = ctx.at;
    if (p.telemetry && typeof p.telemetry === "object") job.telemetry = { ...job.telemetry, ...(p.telemetry as typeof job.telemetry) };
    const rec = p.recommendation as (Recommendation & { title: string; payload: Record<string, unknown>; target: TargetObject; allowedRoles?: ActorRole[]; question?: string; artifactKind?: string }) | undefined;
    if (rec) {
      const ref = nextId(s, "REC");
      s.artifactContent[`recommendation:${ref}`] = rec.payload;
      const art = registerArtifact(s, { kind: "SPECIALIST_RECOMMENDATION", title: rec.title, version: `rev${s.stateRevision}`, producedBy: "AI_SPECIALIST", specialistId: job.specialistId, contentKey: `recommendation:${ref}`, summary: rec.summary, evidenceClass: "AI_GENERATED", authority: "REFERENCE_ONLY" }, ctx.at);
      job.resultArtifactRefs.push(art.artifactId);
      const pd: PendingHumanDecision = { requestId: nextId(s, "REQ"), title: rec.title, question: rec.question ?? `Accept the ${job.specialistId} recommendation into the working design?`, stage: s.currentStage, target: rec.target, allowedRoles: rec.allowedRoles ?? ["CONSULTANT", "DELIVERY_LEAD", "CLIENT_PROCESS_OWNER"], allowedTypes: ["ACCEPT_RECOMMENDATION", "REJECT"], recommendation: { recommendationRef: ref, summary: rec.summary, rationale: rec.rationale, source: "AI_SPECIALIST", specialistId: job.specialistId, confidence: rec.confidence, producedAt: ctx.at, sourceStateRevision: job.sourceStateRevision }, requestedAt: ctx.at, requestedBy: "AI", status: "PENDING" };
      s.pendingHumanDecisions.push(pd);
      ctx.events.push({ type: "DECISION_REQUESTED", summary: `${pd.requestId}: ${rec.title} (AI recommendation ${ref})`, refs: [pd.requestId, ref] });
      ctx.data = { requestId: pd.requestId, recommendationRef: ref, artifactId: art.artifactId };
    }
    ctx.events.push({ type: "JOB_COMPLETED", summary: `${job.jobId} complete`, refs: [job.jobId] });
    ctx.message = `${job.jobId} complete.`;
  },

  FAIL_JOB(ctx) {
    const job = findJob(ctx);
    job.status = "FAILED";
    job.error = String(ctx.req.payload?.error ?? ctx.req.reason ?? "Unknown failure");
    job.updatedAt = ctx.at;
    ctx.events.push({ type: "JOB_FAILED", summary: `${job.jobId} failed: ${job.error}`, refs: [job.jobId] });
    ctx.message = `${job.jobId} failed.`;
  },

  CHECKPOINT(ctx) {
    const s = ctx.state;
    s.checkpoints.push({ checkpointId: nextId(s, "CHK"), at: ctx.at, stateRevision: s.stateRevision + 1, note: String(ctx.req.payload?.note ?? ctx.req.reason ?? "Manual checkpoint") });
    ctx.events.push({ type: "JOB_CHECKPOINTED", summary: "Engagement checkpoint recorded" });
    ctx.message = "Checkpoint recorded.";
  },

  CORRECT_STATE(ctx) {
    // Governed correction of a bounded set of fields by the delivery lead, always with lineage.
    const s = ctx.state;
    const p = ctx.req.payload ?? {};
    const reason = str(ctx.req.reason, "reason");
    if (typeof p.currentStage === "string") {
      pre((["DISCOVERY", "BASELINE_DESIGN", "TARGET_DESIGN", "CLIENT_SDLC"] as string[]).includes(p.currentStage), "Only rollback to a working stage is permitted");
      s.currentStage = p.currentStage as LifecycleStage;
      s.activeStageExecution = { stage: s.currentStage, status: "IN_PROGRESS", startedAt: ctx.at, updatedAt: ctx.at };
    }
    recordDecision(s, { decisionId: nextId(s, "DEC"), type: "CORRECT", target: { type: "STAGE", id: s.currentStage }, actor: ctx.req.actor, rationale: reason, payload: p, at: ctx.at }, s.currentStage);
    recompute(ctx);
    evaluateGates(ctx);
    ctx.events.push({ type: "STATE_CORRECTED", summary: `State corrected: ${reason}` });
    ctx.message = "State corrected with lineage.";
  },
};

function findJob(ctx: Ctx) {
  const id = str(ctx.req.payload?.jobId ?? ctx.req.targetObject?.id, "jobId");
  const job = ctx.state.jobs.find((j) => j.jobId === id);
  if (!job) throw new ActionError("NOT_FOUND", `Job ${id} not found`);
  return job;
}

function normalizeEnterpriseEntry(e: Partial<EnterpriseEntry>, s: FactoryState): EnterpriseEntry {
  const known = new Set(s.evidenceCatalog.map((x) => x.evidenceRef));
  const refs = Array.isArray(e.evidenceRefs) ? e.evidenceRefs.map(String) : [];
  const statuses: EnterpriseEntry["status"][] = ["DOCUMENTED", "CLIENT_STATED", "TO_CONFIRM"];
  let status: EnterpriseEntry["status"] = e.status && statuses.includes(e.status) ? e.status : "TO_CONFIRM";
  // DOCUMENTED needs a real evidence record behind it; otherwise it is at best stated.
  if (status === "DOCUMENTED" && !refs.some((r) => known.has(r))) status = refs.length ? "TO_CONFIRM" : "CLIENT_STATED";
  const entry: EnterpriseEntry = { id: e.id && /^ENT-\d+$/.test(e.id) ? e.id : nextId(s, "ENT"), name: String(e.name ?? "").trim() || "TO_CONFIRM", detail: String(e.detail ?? ""), qualifier: String(e.qualifier ?? ""), owner: String(e.owner ?? "TO_CONFIRM"), evidenceRefs: refs, status };
  if (e.sensitivity) entry.sensitivity = e.sensitivity;
  return entry;
}

/** Evidence references the specialist cited must exist in this engagement's catalog; unknown ones are flagged rather than trusted. */
function flagUnknownEvidenceRefs(ctx: Ctx, steps: WorkflowStep[]) {
  const s = ctx.state;
  const known = new Set(s.evidenceCatalog.map((e) => e.evidenceRef));
  const unknownRefs = new Set<string>();
  for (const st of steps) {
    st.evidenceRefs.filter((r) => !known.has(r)).forEach((r) => unknownRefs.add(r));
    st.rules.forEach((r) => { if (r.provenance.sourceRef && /^EV-/.test(r.provenance.sourceRef) && !known.has(r.provenance.sourceRef)) unknownRefs.add(r.provenance.sourceRef); });
    st.checks.forEach((c) => c.sourceRefs.filter((r) => !known.has(r)).forEach((r) => unknownRefs.add(r)));
  }
  if (unknownRefs.size) s.openItems.push({ itemId: nextId(s, "OPN"), kind: "QUESTION", title: `Draft cites evidence not in the catalog: ${[...unknownRefs].join(", ")}`, detail: "The specialist referenced evidence IDs that do not exist in this engagement. Treat the affected rules and checks as unsupported until re-linked.", owner: "Consultant", stage: s.currentStage, relatedIds: [...unknownRefs], status: "OPEN", raisedAt: ctx.at });
}

function applyRecommendationPayload(ctx: Ctx, rec: Recommendation, draft: Record<string, unknown>) {
  const s = ctx.state;
  const kind = String(draft.kind ?? "");
  if (kind === "BLUEPRINT") {
    const incoming = draft.blueprint as Blueprint;
    const existing = getBlueprint(s);
    const normalized = normalizeBlueprint({ ...incoming, workflowId: s.workflowId }, s);
    normalized.mode = existing?.mode ?? normalized.mode;
    normalized.version = existing ? bumpVersion(existing.version) : "0.1.0";
    normalized.changeLog = [...(existing?.changeLog ?? []), { at: ctx.at, stateRevision: s.stateRevision + 1, summary: `Accepted AI recommendation ${rec.recommendationRef}`, affectedIds: normalized.steps.map((x) => x.contractId), by: `${ctx.req.actor.role}:${ctx.req.actor.userId}` }];
    // Everything AI-produced enters as OPEN for human review.
    normalized.steps.forEach((st) => {
      st.status = "open";
      st.checks.forEach((c) => (c.reviewStatus = "open"));
      st.humanActions.forEach((a) => (a.reviewStatus = "open"));
    });
    s.artifactContent[CONTENT_KEYS.blueprint] = normalized;
    if (!currentArtifact(s, "WORKFLOW_BLUEPRINT")) registerArtifact(s, { kind: "WORKFLOW_BLUEPRINT", title: `${normalized.mode === "BASELINE" ? "Baseline" : "Target"} Workflow Blueprint`, version: normalized.version, producedBy: "AI_SPECIALIST", specialistId: rec.specialistId, contentKey: CONTENT_KEYS.blueprint, summary: `Accepted from ${rec.recommendationRef}` }, ctx.at);
    else currentArtifact(s, "WORKFLOW_BLUEPRINT")!.version = normalized.version;
    if (draft.valueNorthStar && s.valueNorthStar.reviewStatus !== "CONFIRMED") s.valueNorthStar = { ...s.valueNorthStar, ...(draft.valueNorthStar as Partial<FactoryState["valueNorthStar"]>), reviewStatus: "OPEN" };
    normalized.valueNorthStar = s.valueNorthStar;
    if (draft.referenceArchitecture && typeof draft.referenceArchitecture === "object") normalized.referenceArchitecture = { ...normalized.referenceArchitecture, ...(draft.referenceArchitecture as Blueprint["referenceArchitecture"]) };
    s.artifactContent[CONTENT_KEYS.blueprint] = normalized;
    if (Array.isArray(draft.openItems)) for (const o of draft.openItems as { title: string; detail: string; owner?: string; relatedIds?: string[] }[]) s.openItems.push({ itemId: nextId(s, "TC"), kind: "TO_CONFIRM", title: o.title, detail: o.detail, owner: o.owner ?? "TO_CONFIRM", stage: s.currentStage, relatedIds: o.relatedIds ?? [], status: "OPEN", raisedAt: ctx.at });
    // Contradictions the specialist noticed in prose become open questions; the deterministic engine only sees structured claims.
    if (Array.isArray(draft.contradictionsNoted)) for (const c of draft.contradictionsNoted as string[]) if (c.trim()) s.openItems.push({ itemId: nextId(s, "OPN"), kind: "QUESTION", title: `Specialist noted a contradiction: ${c.slice(0, 80)}`, detail: c, owner: "Consultant", stage: s.currentStage, relatedIds: [], status: "OPEN", raisedAt: ctx.at });
    flagUnknownEvidenceRefs(ctx, normalized.steps);
    touchStageExecution(ctx, "IN_PROGRESS");
    ctx.events.push({ type: "WORKFLOW_CHANGED", summary: `Blueprint v${normalized.version} accepted from AI recommendation; all items open for human review` });
  } else if (kind === "BLUEPRINT_ENRICHMENT") {
    // Per-step enrichment: rules, checks and human actions for steps whose structure a human has already confirmed.
    // Unreviewed items on those steps are replaced by the new draft; items a human has confirmed are kept. Step status is untouched.
    const existing = getBlueprint(s);
    pre(existing, "No blueprint to enrich");
    const bp = clone(existing!);
    const incoming = (draft.steps as (WorkflowStepInput & { contractId: string })[]) ?? [];
    const enriched: string[] = [];
    const skipped: string[] = [];
    for (const inc of incoming) {
      const st = bp.steps.find((x) => x.contractId === inc.contractId && !x.archived);
      if (!st || st.status !== "confirmed") {
        skipped.push(inc.contractId);
        continue;
      }
      const keptRules = st.rules.filter((r) => ["CLIENT_CONFIRMED", "VERIFIED"].includes(r.provenance.status));
      st.rules = keptRules.map((r, i) => ({ ...r, ruleId: `${st.contractId}-R${String(i + 1).padStart(2, "0")}` }));
      for (const r of inc.rules ?? []) st.rules.push(normalizeRule(r, nextRuleId(st)));
      st.checks = st.checks.filter((c) => c.reviewStatus === "confirmed");
      for (const c of inc.checks ?? []) {
        const nums = st.checks.map((x) => Number(x.checkId.split("-C").pop()) || 0);
        const checkId = `${st.contractId}-C${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
        st.checks.push(normalizeCheck({ ...c, checkId, execution: { stepId: st.contractId, persona: c.execution?.persona ?? st.owner, point: c.execution?.point ?? "During step" }, reviewStatus: "open" }, st));
      }
      st.humanActions = st.humanActions.filter((a) => a.reviewStatus === "confirmed");
      for (const a of inc.humanActions ?? []) {
        const nums = st.humanActions.map((x) => Number(x.actionId.split("-A").pop()) || 0);
        st.humanActions.push(normalizeAction({ ...a, actionId: `${st.contractId}-A${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`, reviewStatus: "open" }));
      }
      if (st.humanActions.length) {
        st.noHumanDecision = false;
        st.noHumanDecisionReason = "";
      } else if (inc.noHumanDecision === true) {
        st.noHumanDecision = true;
        st.noHumanDecisionReason = inc.noHumanDecisionReason ?? "";
      }
      enriched.push(st.contractId);
    }
    pre(enriched.length > 0, `No confirmed steps matched the enrichment (${skipped.join(", ") || "none proposed"})`);
    bp.version = bumpVersion(bp.version);
    bp.changeLog.push({ at: ctx.at, stateRevision: s.stateRevision + 1, summary: `Enriched ${enriched.length} confirmed step(s) from ${rec.recommendationRef}${skipped.length ? `; skipped unconfirmed ${skipped.join(", ")}` : ""}`, affectedIds: enriched, by: `${ctx.req.actor.role}:${ctx.req.actor.userId}` });
    s.artifactContent[CONTENT_KEYS.blueprint] = bp;
    const art = currentArtifact(s, "WORKFLOW_BLUEPRINT");
    if (art) art.version = bp.version;
    if (Array.isArray(draft.openItems)) for (const o of draft.openItems as { title: string; detail: string; owner?: string; relatedIds?: string[] }[]) s.openItems.push({ itemId: nextId(s, "TC"), kind: "TO_CONFIRM", title: o.title, detail: o.detail, owner: o.owner ?? "TO_CONFIRM", stage: s.currentStage, relatedIds: o.relatedIds ?? [], status: "OPEN", raisedAt: ctx.at });
    flagUnknownEvidenceRefs(ctx, bp.steps.filter((x) => enriched.includes(x.contractId)));
    touchStageExecution(ctx, "IN_PROGRESS");
    ctx.events.push({ type: "WORKFLOW_CHANGED", summary: `Blueprint v${bp.version}: ${enriched.length} step(s) enriched from AI recommendation; new rules, checks and actions open for review`, refs: enriched });
  } else if (kind === "CITATION_VERDICTS") {
    // Citation verification: each rule that cites evidence was checked against that record. Unsupported citations become DISPUTED.
    // Rules a human already confirmed or verified are never downgraded silently; a question is raised instead.
    const existing = getBlueprint(s);
    pre(existing, "No blueprint to verify");
    const bp = clone(existing!);
    const known = new Set(s.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT").map((e) => e.evidenceRef));
    const verdicts = (draft.verdicts as { ruleId: string; verdict: CitationVerdict; quote?: string; note?: string }[]) ?? [];
    const disputed: string[] = [];
    const supported: string[] = [];
    const contested: string[] = [];
    let checked = 0;
    for (const st of activeSteps(bp)) {
      for (const r of st.rules) {
        if (!r.provenance.sourceRef.trim()) continue;
        const v = verdicts.find((x) => x.ruleId === r.ruleId);
        const missing = /^EV-/.test(r.provenance.sourceRef) && !known.has(r.provenance.sourceRef);
        if (!v && !missing) continue;
        const verdict = missing ? "SOURCE_MISSING" : v!.verdict;
        checked += 1;
        r.provenance.verification = { verdict, quote: String(v?.quote ?? ""), note: missing ? `Cited ${r.provenance.sourceRef} is not in this engagement's evidence catalog` : String(v?.note ?? ""), at: ctx.at, recommendationRef: rec.recommendationRef };
        const humanHeld = ["CLIENT_CONFIRMED", "VERIFIED"].includes(r.provenance.status);
        if (verdict === "NOT_SUPPORTED" || verdict === "SOURCE_MISSING") {
          if (humanHeld) contested.push(r.ruleId);
          else {
            r.provenance.status = "DISPUTED";
            disputed.push(r.ruleId);
          }
        } else if (verdict === "SUPPORTED" && r.provenance.status === "UNCONFIRMED") {
          r.provenance.status = "SOURCE_SUPPORTED";
          supported.push(r.ruleId);
        } else if (verdict === "SUPPORTED") supported.push(r.ruleId);
      }
    }
    if (contested.length) s.openItems.push({ itemId: nextId(s, "OPN"), kind: "QUESTION", title: `Citation check contradicts ${contested.length} human-confirmed rule(s): ${contested.join(", ")}`, detail: "The cited evidence does not support these rules, but a human already confirmed or verified them. Re-check the source or the confirmation.", owner: "Consultant", stage: s.currentStage, relatedIds: contested, status: "OPEN", raisedAt: ctx.at });
    bp.version = bumpVersion(bp.version);
    bp.changeLog.push({ at: ctx.at, stateRevision: s.stateRevision + 1, summary: `Citation check ${rec.recommendationRef}: ${checked} rule(s) checked, ${disputed.length} disputed, ${supported.length} supported${contested.length ? `, ${contested.length} contested` : ""}`, affectedIds: [...disputed, ...contested], by: `${ctx.req.actor.role}:${ctx.req.actor.userId}` });
    s.artifactContent[CONTENT_KEYS.blueprint] = bp;
    const art = currentArtifact(s, "WORKFLOW_BLUEPRINT");
    if (art) art.version = bp.version;
    ctx.events.push({ type: "WORKFLOW_CHANGED", summary: `Citation check applied: ${disputed.length} rule(s) marked DISPUTED, ${supported.length} supported`, refs: disputed });
    ctx.data = { ...ctx.data, checked, disputed, supported, contested };
  } else if (kind === "ENTERPRISE_CONTEXT") {
    // AI-drafted landscape enters unconfirmed; entries the draft repeats by name are replaced, others are kept.
    const cur = clone(getEnterpriseContext(s));
    const incoming = (draft.enterpriseContext as Partial<EnterpriseContext>) ?? {};
    for (const k of ENTERPRISE_SECTIONS) {
      const rows = ((incoming[k] as Partial<EnterpriseEntry>[]) ?? []).map((e) => normalizeEnterpriseEntry(e, s));
      const names = new Set(rows.map((r) => r.name.trim().toLowerCase()));
      cur[k] = [...cur[k].filter((e) => !names.has(e.name.trim().toLowerCase())), ...rows];
    }
    if (typeof incoming.summary === "string" && incoming.summary.trim()) cur.summary = incoming.summary;
    cur.gaps = [...new Set([...cur.gaps, ...((incoming.gaps as string[]) ?? []).map(String)])];
    cur.version += 1;
    cur.reviewStatus = "OPEN";
    delete cur.confirmedBy;
    cur.updatedAt = ctx.at;
    s.enterpriseContext = cur;
    if (Array.isArray(draft.openItems)) for (const o of draft.openItems as { title: string; detail: string; owner?: string; relatedIds?: string[] }[]) s.openItems.push({ itemId: nextId(s, "TC"), kind: "TO_CONFIRM", title: o.title, detail: o.detail, owner: o.owner ?? "TO_CONFIRM", stage: s.currentStage, relatedIds: o.relatedIds ?? [], status: "OPEN", raisedAt: ctx.at });
    ctx.events.push({ type: "WORKFLOW_CHANGED", summary: `Enterprise context v${cur.version} drafted from ${rec.recommendationRef}; open for client architect confirmation` });
  } else if (kind === "INTEGRATION_CONTRACT") {
    handlers.SET_INTEGRATION_CONTRACT({ ...ctx, req: { ...ctx.req, payload: { contract: draft.contract } } });
  } else if (kind === "TRANSFORMATION_PLAN") {
    handlers.SET_TRANSFORMATION_PLAN({ ...ctx, req: { ...ctx.req, payload: { plan: draft.plan } } });
  } else if (kind === "TECHNICAL_ENRICHMENT") {
    handlers.COMPILE_TECHNICAL_DESIGN({ ...ctx, req: { ...ctx.req, payload: { aiEnrichment: { specialistId: rec.specialistId, recommendationRef: rec.recommendationRef, notes: (draft.notes as string[]) ?? [] } } } });
  } else if (kind === "OPEN_ITEMS") {
    for (const o of (draft.items as { title: string; detail: string; owner?: string; relatedIds?: string[]; kind?: "TO_CONFIRM" | "BLOCKER" | "RISK" | "QUESTION" }[]) ?? []) s.openItems.push({ itemId: nextId(s, o.kind === "BLOCKER" ? "BLK" : "TC"), kind: o.kind ?? "TO_CONFIRM", title: o.title, detail: o.detail, owner: o.owner ?? "TO_CONFIRM", stage: s.currentStage, relatedIds: o.relatedIds ?? [], status: "OPEN", raisedAt: ctx.at });
  } else if (kind === "EVIDENCE_CLASSIFICATION") {
    for (const c of (draft.classifications as { evidenceRef: string; requirementIds: string[]; evidenceType?: EvidenceRecord["evidenceType"] }[]) ?? []) {
      const rec2 = s.evidenceCatalog.find((e) => e.evidenceRef === c.evidenceRef && e.authorityStatus === "CURRENT");
      if (rec2) {
        rec2.requirementIds = [...new Set([...rec2.requirementIds, ...c.requirementIds])];
        if (c.evidenceType) rec2.evidenceType = c.evidenceType;
      }
    }
    recompute(ctx);
  } else {
    throw new ActionError("PRECONDITION_FAILED", `Unknown recommendation payload kind ${kind}`);
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers (AI or human input → schema-complete objects)
// ---------------------------------------------------------------------------

function resequence(bp: Blueprint) {
  bp.steps.sort((a, b) => a.seq - b.seq).forEach((s, i) => (s.seq = i + 1));
}

export function normalizeRule(r: Partial<Rule>, ruleId: string): Rule {
  const rule: Rule = { ruleId, statement: r.statement ?? "", ruleType: r.ruleType ?? "Business Policy", hardStop: !!r.hardStop, basis: r.basis && BASIS_VALUES.includes(r.basis) ? r.basis : "INFERRED", provenance: { sourceType: r.provenance?.sourceType ?? "TO_VALIDATE", sourceRef: r.provenance?.sourceRef ?? "", status: r.provenance?.status ?? "UNCONFIRMED" } };
  if (r.provenance?.verification) rule.provenance.verification = r.provenance.verification;
  return rule;
}

export function normalizeAction(a: Partial<HumanAction> & { actionId: string }): HumanAction {
  const target = a.targetStepId ?? "";
  return { actionId: a.actionId, name: a.name ?? "Human action", actor: a.actor ?? "TO_CONFIRM", availableWhen: a.availableWhen ?? "", preconditions: a.preconditions ?? "", effect: a.effect ?? "", nextState: a.nextState ?? "", targetStepId: target, routingMode: target === "DYNAMIC_AFFECTED_STEP" ? "DYNAMIC_AFFECTED_STEP" : "FIXED_STEP", systemImpact: a.systemImpact ?? "", rerunBehavior: a.rerunBehavior ?? "", auditRequirements: a.auditRequirements ?? "", reviewStatus: a.reviewStatus ?? "open" };
}

export function normalizeCheck(c: Partial<Omit<Check, "execution">> & { checkId: string; execution?: Partial<Check["execution"]> }, st: Pick<WorkflowStep, "contractId" | "owner">): Check {
  return {
    checkId: c.checkId,
    name: c.name ?? "Check",
    purpose: c.purpose ?? "",
    execution: { stepId: st.contractId, persona: c.execution?.persona ?? st.owner, point: c.execution?.point ?? "During step" },
    supportsDecisionStepIds: Array.isArray(c.supportsDecisionStepIds) ? c.supportsDecisionStepIds : [],
    inputsEvidence: c.inputsEvidence ?? "",
    sourceSystems: c.sourceSystems ?? "",
    logicType: c.logicType ?? "Deterministic",
    expectedResult: c.expectedResult ?? "",
    passAction: c.passAction ?? "",
    failAction: c.failAction ?? "",
    output: c.output ?? "",
    writebackAction: c.writebackAction ?? "",
    authority: c.authority ?? "",
    sourceRefs: Array.isArray(c.sourceRefs) ? c.sourceRefs : [],
    implementationStatus: c.implementationStatus ?? "TO_CONFIRM",
    reviewStatus: c.reviewStatus ?? "open",
    rerunPolicy: c.rerunPolicy ?? "",
    invalidatesCheckIds: Array.isArray(c.invalidatesCheckIds) ? c.invalidatesCheckIds : [],
  };
}

export function normalizeStep(s: WorkflowStepInput & { contractId: string }, bp: Pick<Blueprint, "phases">): WorkflowStep {
  const base: WorkflowStep = {
    contractId: s.contractId,
    seq: s.seq ?? 0,
    phase: s.phase ?? bp.phases[0]?.key ?? "main",
    name: s.name ?? "New step",
    owner: s.owner ?? "TO_CONFIRM",
    lane: s.lane ?? "ops",
    type: s.type ?? "mixed",
    purpose: s.purpose ?? "",
    trigger: s.trigger ?? "",
    inputs: s.inputs ?? [],
    aiRole: s.aiRole ?? "",
    humanAuthority: s.humanAuthority ?? "",
    systems: s.systems ?? [],
    reads: s.reads ?? [],
    writes: s.writes ?? [],
    exceptions: s.exceptions ?? "",
    rerun: s.rerun ?? "",
    outcome: s.outcome ?? "",
    writeback: s.writeback ?? "",
    notes: s.notes ?? "",
    basis: s.basis && BASIS_VALUES.includes(s.basis) ? s.basis : "INFERRED",
    noHumanDecision: s.noHumanDecision === true,
    noHumanDecisionReason: s.noHumanDecisionReason ?? "",
    status: s.status ?? "open",
    archived: !!s.archived,
    origin: s.origin ?? "BASELINE",
    rules: [],
    checks: [],
    humanActions: [],
    authority: { ...defaultAuthority(), ...(s.authority ?? {}) },
    implementation: s.implementation ? { ...defaultImplementation(), ...s.implementation, currentState: { ...defaultImplementation().currentState, ...(s.implementation.currentState ?? {}) }, targetState: { ...defaultImplementation().targetState, ...(s.implementation.targetState ?? {}) }, arbImpact: { ...defaultImplementation().arbImpact, ...(s.implementation.arbImpact ?? {}) } } : defaultImplementation(),
    currentAiRefs: s.currentAiRefs ?? [],
    evidenceRefs: s.evidenceRefs ?? [],
  };
  base.rules = (s.rules ?? []).map((r, i) => normalizeRule(r, `${base.contractId}-R${String(i + 1).padStart(2, "0")}`));
  base.checks = (s.checks ?? []).map((c, i) => normalizeCheck({ ...c, checkId: c.checkId && c.checkId.startsWith(base.contractId) ? c.checkId : `${base.contractId}-C${String(i + 1).padStart(2, "0")}` }, base));
  base.humanActions = (s.humanActions ?? []).map((a, i) => normalizeAction({ ...a, actionId: a.actionId && a.actionId.startsWith(base.contractId) ? a.actionId : `${base.contractId}-A${String(i + 1).padStart(2, "0")}` }));
  return base;
}

export function normalizeBlueprint(bp: Omit<Partial<Blueprint>, "steps" | "currentAi"> & { steps: WorkflowStepInput[]; currentAi?: Partial<Blueprint["currentAi"][number]>[] }, s: Pick<FactoryState, "workflowId" | "valueNorthStar">): Blueprint {
  const phases = bp.phases?.length ? bp.phases : [{ key: "main", name: "Main", desc: "" }];
  const steps = bp.steps.map((st, i) => normalizeStep({ ...st, contractId: st.contractId && /^WF-\d{3}$/.test(st.contractId) ? st.contractId : mkStepId(i + 1), seq: st.seq ?? i + 1 }, { phases }));
  const ids = new Set<string>();
  for (const st of steps) {
    if (ids.has(st.contractId)) throw new ActionError("INVALID_REQUEST", `Duplicate step id ${st.contractId}`);
    ids.add(st.contractId);
  }
  return {
    schema: "ai-delivery-workflow-design-contract-v2",
    workflowId: s.workflowId,
    version: bp.version ?? "0.1.0",
    mode: bp.mode ?? "BASELINE",
    phases,
    steps,
    currentAi: (bp.currentAi ?? []).map((c, i) => ({ id: c.id ?? `AI-${String(i + 1).padStart(3, "0")}`, category: c.category ?? "", capability: c.capability ?? "", currentPosition: c.currentPosition ?? "", treatment: c.treatment ?? "TO_CONFIRM", why: c.why ?? "", evidenceStatus: c.evidenceStatus ?? "TO_CONFIRM", reviewStatus: c.reviewStatus ?? "open", workflowRefs: c.workflowRefs ?? [] })),
    valueNorthStar: bp.valueNorthStar ?? s.valueNorthStar,
    referenceArchitecture: bp.referenceArchitecture ?? { status: "TO_CONFIRM", note: "", patterns: [] },
    changeLog: bp.changeLog ?? [],
  };
}

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------

export function applyAction(input: FactoryState, req: ActionRequest, runtime?: RuntimeContext | null, now = new Date()): ActionResult {
  // 1. validate
  if (!ACTION_TYPES.includes(req.actionType)) throw new ActionError("INVALID_REQUEST", `Unknown action ${String(req.actionType)}`);
  if (req.engagementId !== input.engagement_id) throw new ActionError("ISOLATION", `Request targets ${req.engagementId}; loaded state is ${input.engagement_id}`);
  if (typeof req.expectedStateRevision !== "number" || req.expectedStateRevision !== input.stateRevision) throw new ActionError("STALE_REVISION", `Expected revision ${req.expectedStateRevision}; authoritative state is at ${input.stateRevision}`);
  if (runtime !== undefined && isRuntimeStale(input, runtime)) throw new ActionError("STALE_REVISION", `Runtime projection is stale (projects ${runtime?.projection_of_state_revision ?? "none"}, state is ${input.stateRevision}); regenerate before governed transitions`);
  if (!req.actor || !req.actor.userId || !req.actor.role) throw new ActionError("INVALID_REQUEST", "actor required");
  // 2. authority
  if (!ACTION_ROLES[req.actionType].includes(req.actor.role)) throw new ActionError("UNAUTHORIZED", `Role ${req.actor.role} may not perform ${req.actionType}`);
  // 3-4. preconditions + mutation on a copy
  const state = clone(input);
  const ctx: Ctx = { state, req, at: now.toISOString(), now, events: [], message: "", data: {} };
  handlers[req.actionType](ctx);
  // 5. revision increments exactly once
  state.stateRevision = input.stateRevision + 1;
  state.stateUpdatedAt = ctx.at;
  // Gate evaluations recorded during this transaction are valid for the new revision.
  for (const g of GATE_IDS) {
    const ev = state.gates[g];
    if (ev && ev.evaluatedAtStateRevision === input.stateRevision && ev.evaluatedAt === ctx.at) ev.evaluatedAtStateRevision = state.stateRevision;
  }
  if (state.latestGateEvaluation && state.latestGateEvaluation.evaluatedAt === ctx.at) state.latestGateEvaluation.evaluatedAtStateRevision = state.stateRevision;
  // 6. history
  const cor = correlationId();
  const events: HistoryEvent[] = ctx.events.map((e) => ({ eventId: nextId(state, "EVT", 5), type: e.type, at: ctx.at, stateRevision: state.stateRevision, actor: req.actor, summary: e.summary, correlationId: cor, refs: e.refs ?? [] }));
  state.history.push(...events);
  if (state.history.length > 500) state.history = state.history.slice(-500);
  state.lastRun = { at: ctx.at, actionType: req.actionType, correlationId: cor, summary: ctx.message };
  // 7. projection
  const nextRuntime = projectRuntime(state, now);
  // 8. coherence
  if (nextRuntime.projection_of_state_revision !== state.stateRevision) throw new Error("Projection incoherent after transaction");
  if (state.stateRevision !== input.stateRevision + 1) throw new Error("Revision must increment exactly once");
  // 9. next action
  return { state, runtime: nextRuntime, events, nextHumanAction: nextRuntime.nextHumanAction, message: ctx.message, data: ctx.data };
}
