/**
 * Context Compiler. Every governed AI task runs against a versioned Context Manifest
 * assembled from authoritative sources — never from chat history.
 */

import { activeSteps } from "../blueprint";
import { getBaseline, getBlueprint, getBuildContract, getIntegrationContract, getSimulationPacks, getTechnicalDesign, getTransformationPlan, getValidationReport } from "../content";
import type { FactoryState } from "../schema";
import type { ContextSection, SpecialistContract } from "./contracts";

export type ContextSufficiency = "COMPLETE" | "PARTIAL" | "INSUFFICIENT" | "STALE";

export interface ContextManifest {
  manifestId: string;
  taskType: string;
  engagementId: string;
  workflowId: string;
  actor: { userId: string; role: string };
  stage: string;
  stateRevision: number;
  enterpriseContextRevision: string;
  sectionsIncluded: ContextSection[];
  sectionsMissing: ContextSection[];
  requiredArtifacts: { artifactId: string; kind: string; version: string }[];
  evidenceRefs: string[];
  applicableDecisions: string[];
  unresolvedItems: string[];
  exclusions: string[];
  sufficiency: ContextSufficiency;
  sufficiencyDetail: string;
  /** The compiled, model-facing context (JSON, deterministic key order). */
  body: Record<string, unknown>;
  approxTokens: number;
}

function sectionAvailable(state: FactoryState, section: ContextSection): boolean {
  switch (section) {
    case "ENGAGEMENT":
    case "VALUE_NORTH_STAR":
    case "DECISIONS":
    case "OPEN_ITEMS":
    case "GATES":
    case "DISCOVERY":
      return true;
    case "EVIDENCE":
      return state.evidenceCatalog.some((e) => e.authorityStatus === "CURRENT");
    case "BLUEPRINT":
      return !!getBlueprint(state);
    case "BASELINE":
      return !!getBaseline(state);
    case "INTEGRATION":
      return !!getIntegrationContract(state);
    case "TECHNICAL":
      return !!getTechnicalDesign(state);
    case "PLAN":
      return !!getTransformationPlan(state);
    case "BUILD":
      return !!getBuildContract(state);
    case "VALIDATION":
      return !!getValidationReport(state);
    case "SIMULATION":
      return Object.keys(getSimulationPacks(state)).length > 0;
  }
}

function sectionBody(state: FactoryState, section: ContextSection): unknown {
  switch (section) {
    case "ENGAGEMENT":
      return { engagementId: state.engagement_id, workflowId: state.workflowId, setup: state.engagementSetup, currentStage: state.currentStage, targetDesignMode: state.targetDesignMode, factoryVersion: state.factoryVersion };
    case "EVIDENCE":
      return state.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT").map((e) => ({ evidenceRef: e.evidenceRef, title: e.title, evidenceType: e.evidenceType, sourceClass: e.sourceClass, synthetic: e.synthetic, environment: e.environment, capturedAt: e.capturedAt, scope: e.scope, requirementIds: e.requirementIds, claims: e.claims, summary: e.summary }));
    case "DISCOVERY":
      return { sufficiency: state.discoverySufficiency, requirements: state.evidenceReadinessProfile.requirements.map((r) => ({ requirementId: r.requirementId, description: r.description, requiredByGate: r.requiredByGate, materiality: r.materiality, status: r.status, allowedEvidenceTypes: r.allowedEvidenceTypes })) };
    case "BLUEPRINT": {
      const bp = getBlueprint(state);
      return bp ? { workflowId: bp.workflowId, version: bp.version, mode: bp.mode, phases: bp.phases, steps: activeSteps(bp), currentAi: bp.currentAi, referenceArchitecture: bp.referenceArchitecture } : null;
    }
    case "BASELINE": {
      const b = getBaseline(state);
      return b ? { version: b.version, steps: activeSteps(b).map((s) => ({ contractId: s.contractId, name: s.name, phase: s.phase, purpose: s.purpose, rules: s.rules })) } : null;
    }
    case "VALUE_NORTH_STAR":
      return state.valueNorthStar;
    case "DECISIONS":
      return state.decisions.slice(-40).map((d) => ({ decisionId: d.decisionId, type: d.type, target: d.target, role: d.actor.role, rationale: d.rationale, stage: d.stage }));
    case "OPEN_ITEMS":
      return state.openItems.filter((o) => o.status === "OPEN");
    case "INTEGRATION":
      return getIntegrationContract(state) ?? null;
    case "TECHNICAL":
      return getTechnicalDesign(state) ?? null;
    case "PLAN":
      return getTransformationPlan(state) ?? null;
    case "BUILD":
      return getBuildContract(state) ?? null;
    case "VALIDATION":
      return getValidationReport(state) ?? null;
    case "SIMULATION":
      return Object.values(getSimulationPacks(state)).map((p) => ({ packId: p.packId, mode: p.mode, batch: p.batch, evidenceClass: p.evidenceClass }));
    case "GATES":
      return state.gates;
  }
}

export function compileContext(state: FactoryState, contract: SpecialistContract, actor: { userId: string; role: string }, taskType: string, runtimeRevision: number | null): ContextManifest {
  const wanted = [...contract.requiredContext, ...contract.optionalContext];
  const included: ContextSection[] = [];
  const missing: ContextSection[] = [];
  const body: Record<string, unknown> = {};
  for (const s of wanted) {
    if (sectionAvailable(state, s)) {
      included.push(s);
      body[s] = sectionBody(state, s);
    } else missing.push(s);
  }
  const missingRequired = contract.requiredContext.filter((s) => missing.includes(s));
  let sufficiency: ContextSufficiency;
  let detail: string;
  if (runtimeRevision !== null && runtimeRevision !== state.stateRevision) {
    sufficiency = "STALE";
    detail = `Runtime projects revision ${runtimeRevision}; state is ${state.stateRevision}`;
  } else if (missingRequired.length) {
    sufficiency = "INSUFFICIENT";
    detail = `Missing required context: ${missingRequired.join(", ")}`;
  } else if (missing.length) {
    sufficiency = "PARTIAL";
    detail = `Optional context unavailable: ${missing.join(", ")}`;
  } else {
    sufficiency = "COMPLETE";
    detail = "All required and optional context present";
  }
  const json = JSON.stringify(body);
  return {
    manifestId: `CTX-${contract.id}-${state.engagement_id}-r${state.stateRevision}`,
    taskType,
    engagementId: state.engagement_id,
    workflowId: state.workflowId,
    actor,
    stage: state.currentStage,
    stateRevision: state.stateRevision,
    enterpriseContextRevision: "NONE (single-engagement RC4)",
    sectionsIncluded: included,
    sectionsMissing: missing,
    requiredArtifacts: state.authoritativeArtifacts.filter((a) => a.authority === "CURRENT_AUTHORITATIVE").map((a) => ({ artifactId: a.artifactId, kind: a.kind, version: a.version })),
    evidenceRefs: state.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT").map((e) => e.evidenceRef),
    applicableDecisions: state.decisions.slice(-40).map((d) => d.decisionId),
    unresolvedItems: state.openItems.filter((o) => o.status === "OPEN").map((o) => o.itemId),
    exclusions: ["Conversation history", "Other engagements", "Quarantined or superseded evidence", "Synthetic simulation results as proof"],
    sufficiency,
    sufficiencyDetail: detail,
    body,
    approxTokens: Math.ceil(json.length / 4),
  };
}
