/**
 * Lifecycle router: stage order, advance preconditions and the single dominant next human action.
 */

import { designCompletionSummary } from "./blueprint";
import { getBlueprint, getBuildContract, getIntegrationContract, getRealizationPlan, getTechnicalDesign, getTransformationPlan, getValidationReport } from "./content";
import { GATE_APPROVER_ROLES } from "./decisions";
import { STAGE_EXIT_GATE } from "./gates";
import { LIFECYCLE_STAGES, type FactoryState, type GateId, type LifecycleStage, type NextHumanAction } from "./schema";

export function stageIndex(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

export function nextStage(stage: LifecycleStage): LifecycleStage | null {
  const i = stageIndex(stage);
  return i >= 0 && i < LIFECYCLE_STAGES.length - 1 ? LIFECYCLE_STAGES[i + 1] : null;
}

export const STAGE_LABELS: Record<LifecycleStage, string> = {
  DISCOVERY: "Discovery",
  BASELINE_DESIGN: "Baseline design",
  BASELINE_APPROVAL: "Baseline approval",
  TARGET_PATH_SELECTION: "Target path selection",
  TARGET_DESIGN: "Target design",
  TARGET_DESIGN_APPROVAL: "Target design approval",
  EXPERIENCE: "Experience",
  INTEGRATION_DATA_READINESS: "Integration & data readiness",
  TECHNICAL_DESIGN: "Technical design",
  TRANSFORMATION_PLANNING: "Transformation planning",
  BUILD_CONTRACT: "Build contract",
  IMPLEMENTATION_READINESS: "Implementation readiness",
  CLIENT_SDLC: "Client SDLC",
  IMPLEMENTATION_VALIDATION: "Implementation validation",
  RELEASE_READINESS: "Release readiness",
  HYPERCARE: "Hypercare",
  OPERATE_CI: "Operate / continuous improvement",
};

export interface AdvanceCheck {
  ok: boolean;
  reasons: string[];
  gateId: GateId | null;
}

/**
 * Can the engagement leave its current stage?
 * - Gated stages: gate PASS, or CONDITIONAL accepted by an authorized human (ACCEPT_CONDITIONAL decision at the current gate evaluation revision).
 * - Ungated stages: stage-specific deterministic precondition.
 */
export function canAdvance(state: FactoryState): AdvanceCheck {
  const stage = state.currentStage;
  const gateId = STAGE_EXIT_GATE[stage];
  const reasons: string[] = [];
  if (!nextStage(stage)) return { ok: false, reasons: ["Terminal stage"], gateId };
  if (gateId) {
    const ev = state.gates[gateId];
    if (!ev) reasons.push(`Gate ${gateId} not evaluated`);
    else if (ev.evaluatedAtStateRevision !== state.stateRevision) reasons.push(`Gate ${gateId} evaluated at revision ${ev.evaluatedAtStateRevision}, state is ${state.stateRevision}`);
    else if (ev.outcome === "BLOCKED") reasons.push(...ev.hardStops.map((h) => `BLOCKED — ${h}`));
    else if (ev.outcome === "CONDITIONAL") {
      const entered = state.lifecycleEvidence[stage]?.enteredAtRevision ?? 0;
      const accepted = state.decisions.some((d) => d.type === "ACCEPT_CONDITIONAL" && d.target.type === "GATE" && d.target.id === gateId && GATE_APPROVER_ROLES[gateId].includes(d.actor.role) && d.stateRevisionAtDecision >= entered && JSON.stringify(d.payload?.conditions ?? ev.conditions) === JSON.stringify(ev.conditions));
      if (!accepted) reasons.push(...ev.conditions.map((c) => `CONDITIONAL — ${c} (needs explicit human acceptance)`));
    }
    return { ok: reasons.length === 0, reasons, gateId };
  }
  switch (stage) {
    case "DISCOVERY": {
      if (state.discoverySufficiency.layers.BUSINESS.status === "REQUIRED") reasons.push("Business discovery evidence is REQUIRED before baseline design can start");
      if (!state.evidenceCatalog.some((e) => e.authorityStatus === "CURRENT")) reasons.push("No current evidence recorded");
      break;
    }
    case "BASELINE_DESIGN": {
      const bp = getBlueprint(state);
      if (!bp) reasons.push("No baseline workflow drafted");
      else if (state.activeStageExecution.status !== "REVIEW_READY") reasons.push("Baseline not submitted for review");
      break;
    }
    case "TARGET_DESIGN": {
      const bp = getBlueprint(state);
      if (!bp || bp.mode !== "TARGET") reasons.push("No target design drafted");
      else if (state.activeStageExecution.status !== "REVIEW_READY") reasons.push("Target design not submitted for review");
      break;
    }
    case "EXPERIENCE": {
      if (state.experience.reviewOutcome !== "APPROVED") reasons.push(`Experience review is ${state.experience.reviewOutcome}`);
      break;
    }
    case "CLIENT_SDLC": {
      const hasImpl = state.evidenceCatalog.some((e) => e.authorityStatus === "CURRENT" && !e.synthetic && ["REPOSITORY_CODE", "TEST_RESULTS", "RUNTIME_TRACE", "DEPLOYMENT_CONFIG"].includes(e.evidenceType));
      if (!hasImpl) reasons.push("No real implementation evidence submitted (code, tests, traces or deployment config)");
      break;
    }
  }
  return { ok: reasons.length === 0, reasons, gateId };
}

const CONSULTANT_ROLES = ["CONSULTANT", "DELIVERY_LEAD"] as const;

/** One dominant next human action, derived from authoritative state. */
export function deriveNextAction(state: FactoryState): NextHumanAction {
  const id = state.engagement_id;
  const base = `/engagements/${id}`;
  const stage = state.currentStage;
  const pending = state.pendingHumanDecisions.filter((p) => p.status === "PENDING");
  const stale = state.evidenceReadinessProfile.requirements.some((r) => r.status === "NOT_ASSESSED");
  const interrupted = state.jobs.find((j) => j.status === "INTERRUPTED");
  if (interrupted) return { title: "Resume interrupted job", detail: `${interrupted.jobId} (${interrupted.jobType}) stopped at ${interrupted.lastCheckpoint?.unitId ?? "start"}; resuming reuses completed units.`, actionType: "RESUME_JOB", target: { type: "ARTIFACT", id: interrupted.jobId }, allowedRoles: [...CONSULTANT_ROLES], route: `${base}/simulate` };
  if (stale) return { title: "Assess evidence readiness", detail: "Requirements have not been assessed against the evidence catalog.", actionType: "ASSESS_EVIDENCE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/evidence` };
  const gateId = STAGE_EXIT_GATE[stage];
  const adv = canAdvance(state);

  if (gateId) {
    const ev = state.gates[gateId];
    if (!ev || ev.evaluatedAtStateRevision !== state.stateRevision) return { title: `Evaluate gate ${gateId}`, detail: "Deterministic evaluation against recorded controls and evidence.", actionType: "EVALUATE_GATE", target: { type: "GATE", id: gateId }, allowedRoles: [...CONSULTANT_ROLES], route: `${base}/decisions` };
    if (adv.ok) return { title: `Advance to ${STAGE_LABELS[nextStage(stage)!]}`, detail: `Gate ${gateId} is ${ev.outcome}.`, actionType: "ADVANCE_STAGE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}` };
    const approvalMissing = ev.controls.find((c) => c.controlId.endsWith("HUMAN-APPROVAL") && !c.satisfied);
    const otherHard = ev.hardStops.filter((h) => !h.includes("HUMAN-APPROVAL"));
    if (otherHard.length) {
      const first = otherHard[0];
      const route = /EVID-/.test(first) ? `${base}/evidence` : /INTEGRATION/.test(first) ? `${base}/architecture` : /DESIGN|BASELINE|STRUCTURE/.test(first) ? `${base}/workflow` : /PLAN/.test(first) ? `${base}/plan` : /BUILD|REALIZATION/.test(first) ? `${base}/build` : /VALIDATION|DEPLOYMENT/.test(first) ? `${base}/validate` : `${base}/decisions`;
      return { title: "Clear the hard stop", detail: first, actionType: "RESOLVE_BLOCKER", target: { type: "GATE", id: gateId }, allowedRoles: [...CONSULTANT_ROLES], route };
    }
    if (ev.outcome === "CONDITIONAL" && !approvalMissing) return { title: `Accept conditions on ${gateId}`, detail: ev.conditions.join("; "), actionType: "ACCEPT_CONDITIONAL", target: { type: "GATE", id: gateId }, allowedRoles: GATE_APPROVER_ROLES[gateId], route: `${base}/decisions` };
    if (approvalMissing) return { title: `Approve ${gateId.replaceAll("_", " ").toLowerCase()}`, detail: `Human approval by ${GATE_APPROVER_ROLES[gateId].join(" or ")}. Deterministic controls are otherwise ${ev.outcome === "CONDITIONAL" ? "conditional" : "satisfied"}.`, actionType: "APPROVE", target: { type: "GATE", id: gateId }, allowedRoles: GATE_APPROVER_ROLES[gateId], route: `${base}/decisions` };
  }

  if (pending.length) {
    const p = pending[0];
    return { title: p.title, detail: p.question, actionType: "DECIDE", target: p.target, allowedRoles: p.allowedRoles, route: `${base}/decisions` };
  }

  switch (stage) {
    case "DISCOVERY": {
      if (!state.evidenceCatalog.length) return { title: "Upload initial evidence", detail: "Any existing material — process documents, policies, interview notes, system exports. Unknowns stay TO_CONFIRM.", actionType: "UPLOAD_EVIDENCE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/evidence` };
      const openC = state.discoverySufficiency.contradictions.filter((c) => c.status === "OPEN");
      if (openC.length) return { title: "Resolve evidence contradiction", detail: openC[0].description, actionType: "RESOLVE_CONTRADICTION", target: { type: "CONTRADICTION", id: openC[0].contradictionId }, allowedRoles: ["CONSULTANT", "DELIVERY_LEAD", "CLIENT_BUSINESS_OWNER", "CLIENT_PROCESS_OWNER"], route: `${base}/evidence` };
      if (!adv.ok) return { title: "Close the business discovery gap", detail: adv.reasons[0], actionType: "UPLOAD_EVIDENCE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/evidence` };
      return { title: "Start baseline design", detail: "Business discovery is sufficient to reconstruct the current-state workflow.", actionType: "ADVANCE_STAGE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}` };
    }
    case "BASELINE_DESIGN":
    case "TARGET_DESIGN": {
      const bp = getBlueprint(state);
      if (!bp || (stage === "TARGET_DESIGN" && bp.mode !== "TARGET")) return { title: stage === "BASELINE_DESIGN" ? "Draft the baseline workflow" : "Draft the target design", detail: "Run the Blueprint specialist or author steps directly in the workflow canvas.", actionType: "RUN_SPECIALIST", target: { type: "WORKFLOW", id: state.workflowId }, allowedRoles: [...CONSULTANT_ROLES], route: `${base}/workflow` };
      const dc = designCompletionSummary(bp);
      const structure = dc.areas.find((a) => a.key === "structure")!;
      if (stage === "TARGET_DESIGN" && !dc.complete) return { title: "Complete the target design", detail: `Open: ${[...dc.openAreas, ...dc.invariantViolations].join(", ")}`, actionType: "UPDATE_BLUEPRINT", allowedRoles: [...CONSULTANT_ROLES, "CLIENT_PROCESS_OWNER"], route: `${base}/workflow` };
      if (stage === "BASELINE_DESIGN" && !structure.complete) return { title: "Confirm baseline workflow steps", detail: `${structure.done} of ${structure.total} steps confirmed by structure review.`, actionType: "UPDATE_BLUEPRINT", allowedRoles: [...CONSULTANT_ROLES, "CLIENT_PROCESS_OWNER"], route: `${base}/workflow` };
      if (state.activeStageExecution.status !== "REVIEW_READY") return { title: "Submit for review", detail: "Creates a protected review snapshot and opens the approval stage.", actionType: "SUBMIT_FOR_REVIEW", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/workflow` };
      return { title: `Open ${stage === "BASELINE_DESIGN" ? "baseline" : "target design"} approval`, detail: "Review snapshot is ready.", actionType: "ADVANCE_STAGE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}` };
    }
    case "EXPERIENCE": {
      if (state.experience.reviewOutcome === "APPROVED") return { title: "Proceed to integration & data readiness", detail: "Experience representation approved.", actionType: "ADVANCE_STAGE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}` };
      if (state.experience.substage !== "EXPERIENCE_REVIEW") return { title: "Generate experience pack", detail: `Sub-stage ${state.experience.substage}. Classify experience evidence, then generate the representation.`, actionType: "GENERATE_EXPERIENCE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/experience` };
      return { title: "Review the experience representation", detail: "Approval validates representation of the approved target design only.", actionType: "APPROVE", target: { type: "EXPERIENCE", id: "experience" }, allowedRoles: ["CLIENT_BUSINESS_OWNER", "CLIENT_PROCESS_OWNER"], route: `${base}/experience` };
    }
    case "CLIENT_SDLC": {
      if (!getRealizationPlan(state)) return { title: "Record the Repository Realization Plan", detail: "Coding partner submits reuse, extension, additions, tests and conflicts.", actionType: "REGISTER_REALIZATION_PLAN", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/build` };
      if (adv.ok) return { title: "Validate implementation", detail: "Real implementation evidence is on record.", actionType: "ADVANCE_STAGE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}` };
      return { title: "Submit implementation evidence", detail: adv.reasons[0], actionType: "UPLOAD_EVIDENCE", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/validate` };
    }
    default:
      break;
  }
  // Gated stage with no evaluation yet is handled above; remaining gated stages need artifacts.
  if (stage === "INTEGRATION_DATA_READINESS" && !getIntegrationContract(state)) return { title: "Define the Integration & Data Contract", detail: "Separate business need, logical contract, physical realization and runtime verification per integration.", actionType: "RUN_SPECIALIST", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/architecture` };
  if (stage === "TECHNICAL_DESIGN" && !getTechnicalDesign(state)) return { title: "Compile the technical design", detail: "Deterministic compile from the design contract; AI enrichment optional.", actionType: "RUN_SPECIALIST", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/architecture` };
  if (stage === "TRANSFORMATION_PLANNING" && !getTransformationPlan(state)) return { title: "Build the transformation plan", detail: "Work packages with human baseline and activity-specific AI adjustments.", actionType: "RUN_SPECIALIST", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/plan` };
  if (stage === "BUILD_CONTRACT" && !getBuildContract(state)) return { title: "Generate the Build Contract", detail: "Repository-independent build units with canonical traceability.", actionType: "GENERATE_BUILD_CONTRACT", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/build` };
  if (stage === "IMPLEMENTATION_VALIDATION" && !getValidationReport(state)) return { title: "Run implementation validation", detail: "Validate submitted evidence against the Build Contract.", actionType: "RUN_VALIDATION", allowedRoles: [...CONSULTANT_ROLES], route: `${base}/validate` };
  return { title: "Review engagement state", detail: adv.reasons[0] ?? "No outstanding action.", actionType: "REVIEW", allowedRoles: [...CONSULTANT_ROLES], route: base };
}
