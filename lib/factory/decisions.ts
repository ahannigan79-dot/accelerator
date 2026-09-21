/**
 * Human decisions, waivers, authority.
 *
 * A recommendation ID (REC-) can never substitute for a decision ID (DEC-).
 * AI_SPECIALIST is never an authorized decision role.
 */

import type { Actor, ActorRole, DecisionType, EvidenceRequirement, FactoryState, GateId, HumanDecision, LifecycleStage, Waiver } from "./schema";

export const GATE_APPROVER_ROLES: Record<GateId, ActorRole[]> = {
  BASELINE_APPROVAL: ["CLIENT_BUSINESS_OWNER", "CLIENT_PROCESS_OWNER"],
  TARGET_PATH_SELECTION: ["CLIENT_BUSINESS_OWNER", "DELIVERY_LEAD"],
  TARGET_DESIGN_APPROVAL: ["CLIENT_BUSINESS_OWNER", "CLIENT_PROCESS_OWNER"],
  INTEGRATION_DATA_READINESS: ["CLIENT_ARCHITECT", "CLIENT_IT_OPERATIONS"],
  TECHNICAL_DIRECTION_APPROVAL: ["CLIENT_ARCHITECT", "ARB"],
  TRANSFORMATION_READINESS: ["DELIVERY_LEAD", "CLIENT_BUSINESS_OWNER"],
  BUILD_CONTRACT_APPROVAL: ["CLIENT_ARCHITECT", "DELIVERY_LEAD"],
  IMPLEMENTATION_READINESS: ["DELIVERY_LEAD", "CLIENT_ARCHITECT"],
  TEST_READINESS: ["CLIENT_IT_OPERATIONS", "DELIVERY_LEAD"],
  PRODUCTION_READINESS: ["CLIENT_IT_OPERATIONS", "SECURITY_PRIVACY", "CLIENT_BUSINESS_OWNER"],
  HYPERCARE_EXIT: ["CLIENT_BUSINESS_OWNER", "CLIENT_IT_OPERATIONS"],
  OPERATE_READY: ["CLIENT_PROCESS_OWNER"],
};

export const NEVER_DECIDES: ActorRole[] = ["AI_SPECIALIST"];

export function actorMayDecide(actor: Actor, allowedRoles: ActorRole[]): { ok: boolean; reason: string } {
  if (NEVER_DECIDES.includes(actor.role)) return { ok: false, reason: "AI specialists cannot make human decisions" };
  if (!allowedRoles.includes(actor.role)) return { ok: false, reason: `Role ${actor.role} is not authorized; allowed: ${allowedRoles.join(", ")}` };
  return { ok: true, reason: "" };
}

export function isDecisionId(id: string): boolean {
  return /^DEC-\d+$/.test(id);
}

export interface WaiverValidity {
  valid: boolean;
  reasons: string[];
}

export function isWaiverValid(state: FactoryState, waiver: Waiver, req: EvidenceRequirement, now = new Date()): WaiverValidity {
  const reasons: string[] = [];
  if (waiver.status !== "ACTIVE") reasons.push(`waiver status is ${waiver.status}`);
  if (waiver.engagementId !== state.engagement_id) reasons.push("waiver bound to a different engagement");
  if (waiver.requirementId !== req.requirementId) reasons.push("waiver bound to a different requirement");
  if (waiver.gateId !== req.requiredByGate) reasons.push(`waiver bound to gate ${waiver.gateId}, requirement belongs to ${req.requiredByGate}`);
  if (!isDecisionId(waiver.decisionId)) reasons.push("waiver references a non-decision ID (a recommendation cannot authorize a waiver)");
  const dec = state.decisions.find((d) => d.decisionId === waiver.decisionId);
  if (!dec) reasons.push("authorizing decision not found in lineage");
  else {
    if (dec.type !== "WAIVE") reasons.push(`authorizing decision is ${dec.type}, not WAIVE`);
    if (dec.target.id !== req.requirementId) reasons.push("authorizing decision targets a different object");
    if (!req.waiverAuthority.includes(dec.actor.role)) reasons.push(`role ${dec.actor.role} lacks waiver authority for this requirement`);
    if (dec.actor.role !== waiver.authorizedRole) reasons.push("waiver role does not match the deciding actor's role");
    if (NEVER_DECIDES.includes(dec.actor.role)) reasons.push("AI cannot authorize a waiver");
  }
  if (!waiver.rationale.trim()) reasons.push("rationale missing");
  if (!waiver.reviewBy || !waiver.expiresAt) reasons.push("review/expiry missing");
  if (waiver.expiresAt && new Date(waiver.expiresAt).getTime() < now.getTime()) reasons.push("waiver expired");
  return { valid: reasons.length === 0, reasons };
}

export function recordDecision(
  state: FactoryState,
  input: {
    decisionId: string;
    type: DecisionType;
    target: HumanDecision["target"];
    actor: Actor;
    rationale: string;
    payload?: Record<string, unknown>;
    recommendationRef?: string;
    at: string;
  },
  stage: LifecycleStage,
): HumanDecision {
  const d: HumanDecision = {
    decisionId: input.decisionId,
    engagementId: state.engagement_id,
    stage,
    type: input.type,
    target: input.target,
    actor: input.actor,
    rationale: input.rationale,
    payload: input.payload,
    decidedAt: input.at,
    stateRevisionAtDecision: state.stateRevision,
    recommendationRef: input.recommendationRef,
  };
  state.decisions.push(d);
  return d;
}

/** Approval on a gate is valid only when recorded by an authorized human at or after the current artifact revision. */
export function gateApproval(state: FactoryState, gateId: GateId): HumanDecision | undefined {
  const approvals = state.decisions.filter((d) => d.type === "APPROVE" && d.target.type === "GATE" && d.target.id === gateId && GATE_APPROVER_ROLES[gateId].includes(d.actor.role));
  if (!approvals.length) return undefined;
  const latest = approvals[approvals.length - 1];
  // A later REJECT / REQUEST_CHANGES on the same gate invalidates the approval.
  const laterNegative = state.decisions.some((d) => ["REJECT", "REQUEST_CHANGES"].includes(d.type) && d.target.type === "GATE" && d.target.id === gateId && d.stateRevisionAtDecision > latest.stateRevisionAtDecision);
  return laterNegative ? undefined : latest;
}
