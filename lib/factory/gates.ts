/**
 * Deterministic gate engine.
 *
 * Outcome is derived only from recorded control and evidence objects:
 *  - any unsatisfied BLOCKING control or requirement → BLOCKED (hard stop dominates)
 *  - any unsatisfied ADVISORY control or requirement → CONDITIONAL
 *  - otherwise → PASS
 * A specialist producing an artifact never makes a gate pass; an authorized human approval is a control.
 */

import { designCompletionSummary } from "./blueprint";
import { certifyBuildContract } from "./build";
import { getBaseline, getBlueprint, getBuildContract, getIntegrationContract, getRealizationPlan, getTechnicalDesign, getTransformationPlan, getValidationReport } from "./content";
import { gateApproval, GATE_APPROVER_ROLES } from "./decisions";
import { requirementSatisfied } from "./evidence";
import { integrationBlockers } from "./integration";
import { validatePlan } from "./planner";
import type { FactoryState, GateControlResult, GateEvaluation, GateId, GateRequirementResult, LifecycleStage } from "./schema";

type Control = Omit<GateControlResult, "satisfied" | "detail"> & { check: (s: FactoryState) => { ok: boolean; detail: string } };

function approvalControl(gateId: GateId): Control {
  return {
    controlId: `CTRL-${gateId}-HUMAN-APPROVAL`,
    description: `Explicit human approval recorded by ${GATE_APPROVER_ROLES[gateId].join(" or ")}`,
    materiality: "BLOCKING",
    check: (s) => {
      const d = gateApproval(s, gateId);
      return d ? { ok: true, detail: `${d.decisionId} by ${d.actor.role} at rev ${d.stateRevisionAtDecision}` } : { ok: false, detail: "No authorized human approval on record" };
    },
  };
}

const noOpenBlockers: Control = {
  controlId: "CTRL-NO-OPEN-BLOCKERS",
  description: "No open BLOCKER items for the current stage",
  materiality: "BLOCKING",
  check: (s) => {
    const open = s.openItems.filter((o) => o.status === "OPEN" && o.kind === "BLOCKER" && o.stage === s.currentStage);
    return open.length ? { ok: false, detail: open.map((o) => o.title).join("; ") } : { ok: true, detail: "none" };
  },
};

const CONTROLS: Record<GateId, Control[]> = {
  BASELINE_APPROVAL: [
    {
      controlId: "CTRL-BASELINE-EXISTS",
      description: "A baseline workflow exists with every active step confirmed by structure review",
      materiality: "BLOCKING",
      check: (s) => {
        const bp = getBlueprint(s);
        if (!bp) return { ok: false, detail: "No workflow blueprint" };
        const dc = designCompletionSummary(bp);
        const st = dc.areas.find((a) => a.key === "structure")!;
        return st.complete ? { ok: true, detail: `${st.total} steps confirmed` } : { ok: false, detail: `${st.done}/${st.total} steps confirmed` };
      },
    },
    {
      controlId: "CTRL-DISCOVERY-BUSINESS",
      description: "Business-layer discovery sufficiency is not REQUIRED",
      materiality: "BLOCKING",
      check: (s) => {
        const st = s.discoverySufficiency.layers.BUSINESS.status;
        return st === "REQUIRED" ? { ok: false, detail: "Business discovery evidence still REQUIRED" } : { ok: true, detail: st };
      },
    },
    {
      controlId: "CTRL-NO-OPEN-CONTRADICTIONS",
      description: "No unresolved evidence contradictions",
      materiality: "ADVISORY",
      check: (s) => {
        const open = s.discoverySufficiency.contradictions.filter((c) => c.status === "OPEN");
        return open.length ? { ok: false, detail: `${open.length} open contradiction(s)` } : { ok: true, detail: "none" };
      },
    },
    approvalControl("BASELINE_APPROVAL"),
  ],
  TARGET_PATH_SELECTION: [
    {
      controlId: "CTRL-TARGET-PATH-SELECTED",
      description: "Exactly one target design mode selected by explicit human decision",
      materiality: "BLOCKING",
      check: (s) => {
        const dec = s.decisions.filter((d) => d.type === "SELECT_TARGET_PATH").pop();
        if (s.targetDesignMode === "NOT_SELECTED" || !dec) return { ok: false, detail: "No target path decision" };
        return { ok: true, detail: `${s.targetDesignMode} via ${dec.decisionId}` };
      },
    },
  ],
  TARGET_DESIGN_APPROVAL: [
    {
      controlId: "CTRL-DESIGN-COMPLETE",
      description: "Design completion gates satisfied (structure, checks, actions, current AI, as-built, value, authority, provenance, ARB, treatment)",
      materiality: "BLOCKING",
      check: (s) => {
        const bp = getBlueprint(s);
        if (!bp) return { ok: false, detail: "No blueprint" };
        const dc = designCompletionSummary(bp);
        return dc.complete ? { ok: true, detail: "all areas complete" } : { ok: false, detail: [...dc.openAreas, ...dc.invariantViolations].join("; ") };
      },
    },
    {
      controlId: "CTRL-BASELINE-FROZEN",
      description: "Approved baseline snapshot retained for comparison",
      materiality: "ADVISORY",
      check: (s) => (getBaseline(s) ? { ok: true, detail: "baseline snapshot present" } : { ok: false, detail: "no baseline snapshot" }),
    },
    approvalControl("TARGET_DESIGN_APPROVAL"),
  ],
  INTEGRATION_DATA_READINESS: [
    {
      controlId: "CTRL-INTEGRATION-DESIGN",
      description: "Required integrations client-confirmed; every WRITE has separated authority",
      materiality: "BLOCKING",
      check: (s) => {
        const b = integrationBlockers(getIntegrationContract(s), "DESIGN");
        return b.length ? { ok: false, detail: b.join("; ") } : { ok: true, detail: "all required integrations confirmed" };
      },
    },
    {
      controlId: "CTRL-MOCKABILITY-SET",
      description: "Mockability classified for every required integration",
      materiality: "ADVISORY",
      check: (s) => {
        const tc = (getIntegrationContract(s)?.integrations ?? []).filter((i) => i.requirementStatus !== "NOT_REQUIRED" && i.mockability === "TO_CONFIRM");
        return tc.length ? { ok: false, detail: tc.map((i) => i.integrationId).join(", ") } : { ok: true, detail: "classified" };
      },
    },
    approvalControl("INTEGRATION_DATA_READINESS"),
  ],
  TECHNICAL_DIRECTION_APPROVAL: [
    {
      controlId: "CTRL-TECH-DESIGN-EXISTS",
      description: "Controlled Technical Design is current authoritative",
      materiality: "BLOCKING",
      check: (s) => {
        const td = getTechnicalDesign(s);
        const art = s.authoritativeArtifacts.find((a) => a.kind === "CONTROLLED_TECHNICAL_DESIGN" && a.authority === "CURRENT_AUTHORITATIVE");
        return td && art ? { ok: true, detail: `${art.artifactId} v${art.version}` } : { ok: false, detail: "no authoritative technical design" };
      },
    },
    {
      controlId: "CTRL-OPEN-DECISIONS",
      description: "No open technical decisions blocking this gate",
      materiality: "BLOCKING",
      check: (s) => {
        const od = (getTechnicalDesign(s)?.openDecisions ?? []).filter((d) => d.blocksGate === "TECHNICAL_DIRECTION_APPROVAL");
        const resolved = new Set(s.decisions.filter((d) => d.type === "ANSWER" && d.target.type === "DECISION").map((d) => d.target.id));
        const open = od.filter((d) => !resolved.has(d.decisionKey));
        return open.length ? { ok: false, detail: open.map((d) => `${d.decisionKey} ${d.topic}`).join("; ") } : { ok: true, detail: "none open" };
      },
    },
    {
      controlId: "CTRL-OBSERVABILITY",
      description: "Client observability ecosystem reused, or a parallel platform explicitly decided",
      materiality: "BLOCKING",
      check: (s) => (s.itObservability.inheritsClientEcosystem || s.itObservability.newParallelPlatformDecisionId ? { ok: true, detail: s.itObservability.inheritsClientEcosystem ? "inherits client ecosystem" : `decision ${s.itObservability.newParallelPlatformDecisionId}` } : { ok: false, detail: "parallel telemetry platform without architecture decision" }),
    },
    {
      controlId: "CTRL-ARB",
      description: "ARB review recorded where required",
      materiality: "BLOCKING",
      check: (s) => {
        const needs = getTechnicalDesign(s)?.arbNeeds ?? [];
        if (!needs.length) return { ok: true, detail: "no ARB needs" };
        const arb = s.decisions.some((d) => d.actor.role === "ARB" && d.type === "APPROVE" && d.target.type === "ARTIFACT");
        return arb ? { ok: true, detail: "ARB approval on record" } : { ok: false, detail: `${needs.length} ARB need(s) without ARB decision` };
      },
    },
    approvalControl("TECHNICAL_DIRECTION_APPROVAL"),
  ],
  TRANSFORMATION_READINESS: [
    {
      controlId: "CTRL-PLAN-VALID",
      description: "Work-package plan valid: activity-specific AI assumptions, floors declared, dependency-aware timeline, no economics inferred",
      materiality: "BLOCKING",
      check: (s) => {
        const issues = validatePlan(getTransformationPlan(s));
        return issues.length ? { ok: false, detail: issues.slice(0, 4).join("; ") } : { ok: true, detail: "plan valid" };
      },
    },
    approvalControl("TRANSFORMATION_READINESS"),
  ],
  BUILD_CONTRACT_APPROVAL: [
    {
      controlId: "CTRL-BUILD-CONTRACT-CERTIFIED",
      description: "Build Contract certified internally valid",
      materiality: "BLOCKING",
      check: (s) => {
        const c = certifyBuildContract(getBuildContract(s));
        return c.outcome === "PASS" ? { ok: true, detail: "certified" } : { ok: false, detail: c.findings.slice(0, 4).join("; ") };
      },
    },
    approvalControl("BUILD_CONTRACT_APPROVAL"),
  ],
  IMPLEMENTATION_READINESS: [
    {
      controlId: "CTRL-REALIZATION-PLAN",
      description: "Coding partner returned a Repository Realization Plan with no open conflicts",
      materiality: "BLOCKING",
      check: (s) => {
        const rp = getRealizationPlan(s);
        if (!rp) return { ok: false, detail: "no Repository Realization Plan" };
        const open = rp.conflicts.filter((c) => c.status !== "RESOLVED");
        return open.length ? { ok: false, detail: `${open.length} conflict(s) returned to Factory unresolved` } : { ok: true, detail: "plan accepted" };
      },
    },
    {
      controlId: "CTRL-INTEGRATION-BUILD",
      description: "Interfaces that must be real before build are ACCESS_READY or later",
      materiality: "BLOCKING",
      check: (s) => {
        const b = integrationBlockers(getIntegrationContract(s), "BUILD");
        return b.length ? { ok: false, detail: b.join("; ") } : { ok: true, detail: "ok" };
      },
    },
    approvalControl("IMPLEMENTATION_READINESS"),
  ],
  TEST_READINESS: [
    {
      controlId: "CTRL-VALIDATION-NO-FAIL",
      description: "Code validation report exists with no FAIL units",
      materiality: "BLOCKING",
      check: (s) => {
        const r = getValidationReport(s);
        if (!r) return { ok: false, detail: "no validation report" };
        return r.summary.FAIL ? { ok: false, detail: `${r.summary.FAIL} FAIL unit(s)` } : { ok: true, detail: `PASS ${r.summary.PASS} · PARTIAL ${r.summary.PARTIAL} · GAP ${r.summary.GAP}` };
      },
    },
    {
      controlId: "CTRL-VALIDATION-NO-GAP",
      description: "No GAP units",
      materiality: "ADVISORY",
      check: (s) => {
        const r = getValidationReport(s);
        return r && r.summary.GAP ? { ok: false, detail: `${r.summary.GAP} GAP unit(s)` } : { ok: true, detail: "none" };
      },
    },
    {
      controlId: "CTRL-INTEGRATION-UAT",
      description: "Interfaces that must be real before UAT are CONNECTED or later",
      materiality: "BLOCKING",
      check: (s) => {
        const b = integrationBlockers(getIntegrationContract(s), "UAT");
        return b.length ? { ok: false, detail: b.join("; ") } : { ok: true, detail: "ok" };
      },
    },
    approvalControl("TEST_READINESS"),
  ],
  PRODUCTION_READINESS: [
    {
      controlId: "CTRL-VALIDATION-ALL-PASS",
      description: "Every build unit PASS (PARTIAL is conditional; GAP/FAIL block)",
      materiality: "BLOCKING",
      check: (s) => {
        const r = getValidationReport(s);
        if (!r) return { ok: false, detail: "no validation report" };
        if (r.summary.FAIL || r.summary.GAP || r.summary.NOT_ASSESSED) return { ok: false, detail: `FAIL ${r.summary.FAIL} · GAP ${r.summary.GAP} · NOT_ASSESSED ${r.summary.NOT_ASSESSED}` };
        return { ok: true, detail: `PASS ${r.summary.PASS}` };
      },
    },
    {
      controlId: "CTRL-VALIDATION-NO-PARTIAL",
      description: "No PARTIAL units",
      materiality: "ADVISORY",
      check: (s) => {
        const r = getValidationReport(s);
        return r && r.summary.PARTIAL ? { ok: false, detail: `${r.summary.PARTIAL} PARTIAL unit(s)` } : { ok: true, detail: "none" };
      },
    },
    {
      controlId: "CTRL-INTEGRATION-RELEASE",
      description: "Interfaces END_TO_END_VERIFIED where real evidence is required before release",
      materiality: "BLOCKING",
      check: (s) => {
        const b = integrationBlockers(getIntegrationContract(s), "RELEASE");
        return b.length ? { ok: false, detail: b.join("; ") } : { ok: true, detail: "ok" };
      },
    },
    {
      controlId: "CTRL-DEPLOYMENT-PROVEN",
      description: "Deployment proven by real config/runtime evidence, not statements",
      materiality: "BLOCKING",
      check: (s) => {
        const r = getValidationReport(s);
        return r?.deploymentProven ? { ok: true, detail: "real deployment evidence" } : { ok: false, detail: "no real deployment evidence" };
      },
    },
    noOpenBlockers,
    approvalControl("PRODUCTION_READINESS"),
  ],
  HYPERCARE_EXIT: [noOpenBlockers, approvalControl("HYPERCARE_EXIT")],
  OPERATE_READY: [
    {
      controlId: "CTRL-VNS-CONFIRMED",
      description: "Value North Star confirmed with owner and cadence",
      materiality: "BLOCKING",
      check: (s) => (s.valueNorthStar.reviewStatus === "CONFIRMED" ? { ok: true, detail: s.valueNorthStar.primaryMetric } : { ok: false, detail: "not confirmed" }),
    },
    approvalControl("OPERATE_READY"),
  ],
};

export function evaluateGate(state: FactoryState, gateId: GateId, now = new Date()): GateEvaluation {
  const controls: GateControlResult[] = CONTROLS[gateId].map((c) => {
    const r = c.check(state);
    return { controlId: c.controlId, description: c.description, materiality: c.materiality, satisfied: r.ok, detail: r.detail };
  });
  const requirements: GateRequirementResult[] = state.evidenceReadinessProfile.requirements
    .filter((r) => r.requiredByGate === gateId)
    .map((r) => ({ requirementId: r.requirementId, materiality: r.materiality, status: r.status, satisfied: requirementSatisfied(r), detail: `${r.description}: ${r.statusDetail}` }));
  const hardStops = [
    ...controls.filter((c) => c.materiality === "BLOCKING" && !c.satisfied).map((c) => `${c.controlId}: ${c.detail}`),
    ...requirements.filter((r) => r.materiality === "BLOCKING" && !r.satisfied).map((r) => `${r.requirementId} is ${r.status}: ${r.detail}`),
  ];
  const conditions = [
    ...controls.filter((c) => c.materiality === "ADVISORY" && !c.satisfied).map((c) => `${c.controlId}: ${c.detail}`),
    ...requirements.filter((r) => r.materiality === "ADVISORY" && !r.satisfied).map((r) => `${r.requirementId} is ${r.status}: ${r.detail}`),
  ];
  const outcome = hardStops.length ? "BLOCKED" : conditions.length ? "CONDITIONAL" : "PASS";
  return {
    gateId,
    outcome,
    evaluatedAt: now.toISOString(),
    evaluatedAtStateRevision: state.stateRevision,
    hardStops,
    conditions,
    controls,
    requirements,
    blockers: [...hardStops, ...conditions],
  };
}

/** Which gate governs exit from a stage (null = human action only). */
export const STAGE_EXIT_GATE: Record<LifecycleStage, GateId | null> = {
  DISCOVERY: null,
  BASELINE_DESIGN: null,
  BASELINE_APPROVAL: "BASELINE_APPROVAL",
  TARGET_PATH_SELECTION: "TARGET_PATH_SELECTION",
  TARGET_DESIGN: null,
  TARGET_DESIGN_APPROVAL: "TARGET_DESIGN_APPROVAL",
  EXPERIENCE: null,
  INTEGRATION_DATA_READINESS: "INTEGRATION_DATA_READINESS",
  TECHNICAL_DESIGN: "TECHNICAL_DIRECTION_APPROVAL",
  TRANSFORMATION_PLANNING: "TRANSFORMATION_READINESS",
  BUILD_CONTRACT: "BUILD_CONTRACT_APPROVAL",
  IMPLEMENTATION_READINESS: "IMPLEMENTATION_READINESS",
  CLIENT_SDLC: null,
  IMPLEMENTATION_VALIDATION: "TEST_READINESS",
  RELEASE_READINESS: "PRODUCTION_READINESS",
  HYPERCARE: "HYPERCARE_EXIT",
  OPERATE_CI: "OPERATE_READY",
};

export function evaluateAllGates(state: FactoryState, now = new Date()): Record<GateId, GateEvaluation> {
  const out = {} as Record<GateId, GateEvaluation>;
  for (const g of Object.keys(CONTROLS) as GateId[]) out[g] = evaluateGate(state, g, now);
  return out;
}
