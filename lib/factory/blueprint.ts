/**
 * Workflow Blueprint design model and design-completion gates.
 *
 * Generalizes the Blueprint Interaction Standard (v12.12): stable step IDs,
 * separate review of structure / checks / human actions / current AI / as-built,
 * Value North Star readiness, AI authority, rule provenance, ARB assessment,
 * implementation treatment, baseline comparison and downstream handoff readiness.
 *
 * Everything here is deterministic. AI may propose content; only humans confirm.
 */

import type { ValueNorthStar } from "./schema";

export const DESIGN_SCHEMA = "ai-delivery-workflow-design-contract-v2";

export type ReviewStatus = "open" | "confirmed" | "changes_requested";

export const IMPLEMENTATION_TREATMENTS = [
  "KEEP",
  "REUSE",
  "EXTEND",
  "HARDEN",
  "REFACTOR",
  "REPLACE",
  "REDUCE",
  "BUILD_NEW",
  "TO_CONFIRM",
] as const;
export type ImplementationTreatment = (typeof IMPLEMENTATION_TREATMENTS)[number];

export type RuleType = "Business Policy" | "Deterministic" | "Regulatory" | "Human Authority" | "Data Quality";
export type RuleProvenanceStatus = "UNCONFIRMED" | "CLIENT_CONFIRMED" | "SOURCE_SUPPORTED" | "VERIFIED" | "DISPUTED";

export interface Rule {
  ruleId: string; // WF-003-R01
  statement: string;
  ruleType: RuleType;
  hardStop: boolean;
  provenance: { sourceType: string; sourceRef: string; status: RuleProvenanceStatus };
}

export type LogicType = "Deterministic" | "AI-assisted" | "Human judgment" | "Hybrid";

export interface Check {
  checkId: string; // WF-003-C01 — prefix must equal execution.stepId
  name: string;
  purpose: string;
  execution: { stepId: string; persona: string; point: string };
  supportsDecisionStepIds: string[];
  inputsEvidence: string;
  sourceSystems: string;
  logicType: LogicType;
  expectedResult: string;
  passAction: string;
  failAction: string;
  output: string;
  writebackAction: string;
  authority: string;
  sourceRefs: string[];
  implementationStatus: "NOT_IMPLEMENTED" | "PARTIAL" | "IMPLEMENTED" | "TO_CONFIRM";
  reviewStatus: ReviewStatus;
  rerunPolicy: string;
  invalidatesCheckIds: string[];
}

export interface HumanAction {
  actionId: string; // WF-003-A01
  name: string;
  actor: string;
  availableWhen: string;
  preconditions: string;
  effect: string;
  nextState: string;
  targetStepId: string; // step id or DYNAMIC_AFFECTED_STEP
  routingMode: "FIXED_STEP" | "DYNAMIC_AFFECTED_STEP";
  systemImpact: string;
  rerunBehavior: string;
  auditRequirements: string;
  reviewStatus: ReviewStatus;
}

export interface Authority {
  autonomyLevel: "TBD" | "ASSIST" | "RECOMMEND" | "EXECUTE_WITH_APPROVAL" | "EXECUTE_BOUNDED" | "NONE";
  aiCanEvaluate: boolean | null;
  aiCanRecommend: boolean | null;
  aiCanExecute: boolean | null;
  aiCanWriteback: boolean | null;
  aiCanAdvance: boolean | null;
  humanApprovalRequired: "TBD" | "ALWAYS" | "ON_EXCEPTION" | "NEVER";
  hardGuardrails: string[];
}

export interface ArbImpact {
  reviewRequired: "TBD" | "NONE" | "REQUIRED";
  reason: string;
  topics: string[];
}

export interface Implementation {
  reviewStatus: ReviewStatus;
  currentState: {
    assessmentStatus: "UNASSESSED" | "NO_CURRENT_CAPABILITY" | "PARTIAL_CAPABILITY" | "FULL_CAPABILITY" | "TO_CONFIRM";
    summary: string;
    evidenceRefs: string[];
    services: string[];
    integrations: string[];
    knownLimitations: string[];
  };
  targetState: {
    treatment: ImplementationTreatment;
    rationale: string;
    services: string[];
    apiContracts: string[];
    dataObjects: string[];
    telemetry: string[];
    dependencies: string[];
    doNotReplace: string[];
  };
  arbImpact: ArbImpact;
}

export interface WorkflowStep {
  contractId: string; // WF-###
  seq: number;
  phase: string;
  name: string;
  owner: string;
  lane: string;
  type: "human" | "ai" | "system" | "mixed";
  purpose: string;
  trigger: string;
  inputs: string[];
  aiRole: string;
  humanAuthority: string;
  systems: string[];
  reads: string[];
  writes: string[];
  exceptions: string;
  rerun: string;
  outcome: string;
  writeback: string;
  notes: string;
  status: ReviewStatus;
  archived: boolean;
  origin: "BASELINE" | "ADDED" | "REIMAGINED";
  rules: Rule[];
  checks: Check[];
  humanActions: HumanAction[];
  authority: Authority;
  implementation: Implementation;
  currentAiRefs: string[];
  evidenceRefs: string[];
}

/** Loosely-typed step input accepted by normalization (AI or human authored). */
export type WorkflowStepInput = Omit<Partial<WorkflowStep>, "rules" | "checks" | "humanActions" | "authority" | "implementation"> & {
  rules?: Partial<Rule>[];
  checks?: (Partial<Omit<Check, "execution">> & { execution?: Partial<Check["execution"]> })[];
  humanActions?: Partial<HumanAction>[];
  authority?: Partial<Authority>;
  implementation?: Partial<Omit<Implementation, "currentState" | "targetState" | "arbImpact">> & { currentState?: Partial<Implementation["currentState"]>; targetState?: Partial<Implementation["targetState"]>; arbImpact?: Partial<ArbImpact> };
};

export interface Phase {
  key: string;
  name: string;
  desc: string;
}

export interface CurrentAiItem {
  id: string; // AI-###
  category: string;
  capability: string;
  currentPosition: string;
  treatment: ImplementationTreatment;
  why: string;
  evidenceStatus: "CURRENT_STATE_DOCUMENTED" | "CLIENT_STATED" | "VERIFIED_IN_RUNTIME" | "TO_CONFIRM";
  reviewStatus: ReviewStatus;
  workflowRefs: string[];
}

export interface BlueprintChange {
  at: string;
  stateRevision: number;
  summary: string;
  affectedIds: string[];
  by: string;
}

export interface Blueprint {
  schema: typeof DESIGN_SCHEMA;
  workflowId: string;
  version: string;
  mode: "BASELINE" | "TARGET";
  phases: Phase[];
  steps: WorkflowStep[];
  currentAi: CurrentAiItem[];
  valueNorthStar: ValueNorthStar;
  referenceArchitecture: { status: string; note: string; patterns: string[] };
  changeLog: BlueprintChange[];
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function defaultAuthority(): Authority {
  return {
    autonomyLevel: "TBD",
    aiCanEvaluate: null,
    aiCanRecommend: null,
    aiCanExecute: null,
    aiCanWriteback: null,
    aiCanAdvance: null,
    humanApprovalRequired: "TBD",
    hardGuardrails: [],
  };
}

export function defaultImplementation(): Implementation {
  return {
    reviewStatus: "open",
    currentState: { assessmentStatus: "UNASSESSED", summary: "", evidenceRefs: [], services: [], integrations: [], knownLimitations: [] },
    targetState: { treatment: "TO_CONFIRM", rationale: "", services: [], apiContracts: [], dataObjects: [], telemetry: [], dependencies: [], doNotReplace: [] },
    arbImpact: { reviewRequired: "TBD", reason: "", topics: [] },
  };
}

export function stepId(n: number): string {
  return `WF-${String(n).padStart(3, "0")}`;
}

export function nextCheckId(step: WorkflowStep): string {
  const nums = step.checks.map((c) => Number(c.checkId.split("-C").pop()) || 0);
  return `${step.contractId}-C${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
}

export function nextActionId(step: WorkflowStep): string {
  const nums = step.humanActions.map((a) => Number(a.actionId.split("-A").pop()) || 0);
  return `${step.contractId}-A${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, "0")}`;
}

export function nextRuleId(step: WorkflowStep): string {
  return `${step.contractId}-R${String(step.rules.length + 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Design completion gates (deterministic)
// ---------------------------------------------------------------------------

export function activeSteps(bp: Blueprint): WorkflowStep[] {
  return bp.steps.filter((s) => !s.archived).sort((a, b) => a.seq - b.seq);
}

export function workflowStructureConfirmed(bp: Blueprint): boolean {
  const steps = activeSteps(bp);
  return steps.length > 0 && steps.every((s) => s.status === "confirmed");
}

export function checksConfirmed(bp: Blueprint): boolean {
  const checks = activeSteps(bp).flatMap((s) => s.checks);
  return checks.every((c) => c.reviewStatus === "confirmed");
}

export function humanActionsConfirmed(bp: Blueprint): boolean {
  const actions = activeSteps(bp).flatMap((s) => s.humanActions);
  return actions.every((a) => a.reviewStatus === "confirmed");
}

export function currentAiConfirmed(bp: Blueprint): boolean {
  return bp.currentAi.every((i) => i.reviewStatus === "confirmed");
}

export function asBuiltAssessed(bp: Blueprint): boolean {
  return activeSteps(bp).every((s) => s.implementation.currentState.assessmentStatus !== "UNASSESSED");
}

const PLACEHOLDER = /\b(to confirm|confirm exact|tbd|to_confirm)\b/i;

export function valueMetricReady(v: ValueNorthStar): boolean {
  const fields = [v.objective, v.primaryMetric, v.measurementGranularity, v.unit, v.startEvent, v.endEvent, v.baseline, v.target, v.owner, v.reportingCadence];
  const clean = fields.every((x) => String(x || "").trim() && !PLACEHOLDER.test(String(x)));
  return clean && v.direction !== "TO_CONFIRM" && v.reviewStatus === "CONFIRMED";
}

export function authorityResolved(step: WorkflowStep): boolean {
  const a = step.authority;
  return (
    a.autonomyLevel !== "TBD" &&
    typeof a.aiCanEvaluate === "boolean" &&
    typeof a.aiCanRecommend === "boolean" &&
    typeof a.aiCanExecute === "boolean" &&
    typeof a.aiCanWriteback === "boolean" &&
    typeof a.aiCanAdvance === "boolean" &&
    a.humanApprovalRequired !== "TBD"
  );
}

export function ruleEvidenceResolved(rule: Rule): boolean {
  const p = rule.provenance;
  if (!["CLIENT_CONFIRMED", "SOURCE_SUPPORTED", "VERIFIED"].includes(p.status)) return false;
  if (["SOURCE_SUPPORTED", "VERIFIED"].includes(p.status) && !p.sourceRef.trim()) return false;
  return true;
}

export function arbAssessmentResolved(step: WorkflowStep): boolean {
  return ["NONE", "REQUIRED"].includes(step.implementation.arbImpact.reviewRequired);
}

export function treatmentClassified(step: WorkflowStep): boolean {
  return step.implementation.targetState.treatment !== "TO_CONFIRM";
}

/** Canonical check invariant: check ID workflow prefix == execution.stepId. */
export function checkInvariantViolations(bp: Blueprint): string[] {
  const out: string[] = [];
  for (const s of activeSteps(bp)) {
    for (const c of s.checks) {
      const prefix = c.checkId.replace(/-C\d+$/, "");
      if (prefix !== c.execution.stepId || c.execution.stepId !== s.contractId) {
        out.push(`${c.checkId} executes at ${c.execution.stepId} but lives on ${s.contractId}`);
      }
      // Preparation vs. consumption must stay distinct: a check may not list its own step as the only downstream consumer.
      if (c.supportsDecisionStepIds.length && c.supportsDecisionStepIds.every((id) => id === s.contractId)) {
        out.push(`${c.checkId} lists only its own execution step as downstream decision consumer`);
      }
    }
  }
  return out;
}

export interface DesignCompletion {
  areas: { key: string; label: string; done: number; total: number; complete: boolean }[];
  openAreas: string[];
  complete: boolean;
  invariantViolations: string[];
}

export function designCompletionSummary(bp: Blueprint): DesignCompletion {
  const steps = activeSteps(bp);
  const rules = steps.flatMap((s) => s.rules);
  const checks = steps.flatMap((s) => s.checks);
  const actions = steps.flatMap((s) => s.humanActions);
  const areas = [
    { key: "structure", label: "Workflow structure", done: steps.filter((s) => s.status === "confirmed").length, total: steps.length },
    { key: "checks", label: "Checks and correlated outputs", done: checks.filter((c) => c.reviewStatus === "confirmed").length, total: checks.length },
    { key: "actions", label: "Human actions", done: actions.filter((a) => a.reviewStatus === "confirmed").length, total: actions.length },
    { key: "currentAi", label: "Current AI inventory", done: bp.currentAi.filter((i) => i.reviewStatus === "confirmed").length, total: bp.currentAi.length },
    { key: "asBuilt", label: "As-built assessment", done: steps.filter((s) => s.implementation.currentState.assessmentStatus !== "UNASSESSED").length, total: steps.length },
    { key: "value", label: "Value North Star", done: valueMetricReady(bp.valueNorthStar) ? 1 : 0, total: 1 },
    { key: "authority", label: "AI authority", done: steps.filter(authorityResolved).length, total: steps.length },
    { key: "provenance", label: "Rule evidence / provenance", done: rules.filter(ruleEvidenceResolved).length, total: rules.length },
    { key: "arb", label: "ARB assessment", done: steps.filter(arbAssessmentResolved).length, total: steps.length },
    { key: "treatment", label: "Implementation treatment", done: steps.filter(treatmentClassified).length, total: steps.length },
  ].map((a) => ({ ...a, complete: a.done === a.total }));
  const invariantViolations = checkInvariantViolations(bp);
  const openAreas = areas.filter((a) => !a.complete).map((a) => a.label);
  return { areas, openAreas, complete: openAreas.length === 0 && invariantViolations.length === 0, invariantViolations };
}

/** Readiness to hand the design to the Technical Compiler. */
export function technicalHandoffReadiness(bp: Blueprint): { ready: boolean; reasons: string[] } {
  const dc = designCompletionSummary(bp);
  const reasons = [...dc.openAreas.map((a) => `${a} not complete`), ...dc.invariantViolations];
  return { ready: reasons.length === 0, reasons };
}

/** Readiness to publish the workflow to a shared Command Center registry. */
export function commandCenterHandoffReadiness(bp: Blueprint): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!workflowStructureConfirmed(bp)) reasons.push("Workflow structure not confirmed");
  if (!valueMetricReady(bp.valueNorthStar)) reasons.push("Value North Star not confirmed");
  const unresolvedAuthority = activeSteps(bp).filter((s) => !authorityResolved(s)).length;
  if (unresolvedAuthority) reasons.push(`${unresolvedAuthority} step(s) without resolved AI authority`);
  return { ready: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Baseline comparison
// ---------------------------------------------------------------------------

export interface StepDiff {
  contractId: string;
  name: string;
  change: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED" | "ARCHIVED";
  fields: string[];
}

export function compareToBaseline(baseline: Blueprint, target: Blueprint): StepDiff[] {
  const out: StepDiff[] = [];
  const base = new Map(baseline.steps.map((s) => [s.contractId, s]));
  const tgt = new Map(target.steps.map((s) => [s.contractId, s]));
  const fieldsToCompare: (keyof WorkflowStep)[] = ["name", "owner", "lane", "type", "purpose", "trigger", "aiRole", "humanAuthority", "outcome", "writeback", "rerun", "exceptions"];
  for (const [id, t] of tgt) {
    const b = base.get(id);
    if (!b) {
      out.push({ contractId: id, name: t.name, change: "ADDED", fields: [] });
      continue;
    }
    if (t.archived && !b.archived) {
      out.push({ contractId: id, name: t.name, change: "ARCHIVED", fields: [] });
      continue;
    }
    const fields: string[] = fieldsToCompare.filter((f) => JSON.stringify(b[f]) !== JSON.stringify(t[f]));
    if (b.rules.length !== t.rules.length || b.rules.some((r, i) => r.statement !== t.rules[i]?.statement)) fields.push("rules");
    if (b.checks.length !== t.checks.length) fields.push("checks");
    if (b.humanActions.length !== t.humanActions.length) fields.push("humanActions");
    if (JSON.stringify(b.authority) !== JSON.stringify(t.authority)) fields.push("authority");
    if (b.implementation.targetState.treatment !== t.implementation.targetState.treatment) fields.push("treatment");
    out.push({ contractId: id, name: t.name, change: fields.length ? "MODIFIED" : "UNCHANGED", fields });
  }
  for (const [id, b] of base) if (!tgt.has(id)) out.push({ contractId: id, name: b.name, change: "REMOVED", fields: [] });
  return out.sort((a, b) => a.contractId.localeCompare(b.contractId));
}

// ---------------------------------------------------------------------------
// Targeted invalidation
// ---------------------------------------------------------------------------

/** Given changed step IDs, return the downstream check/action IDs that must be re-reviewed. */
export function dependentsOf(bp: Blueprint, changedStepIds: string[]): { checkIds: string[]; actionIds: string[]; stepIds: string[] } {
  const changed = new Set(changedStepIds);
  const checkIds = new Set<string>();
  const actionIds = new Set<string>();
  const stepIds = new Set<string>();
  for (const s of activeSteps(bp)) {
    for (const c of s.checks) {
      if (changed.has(s.contractId) || c.supportsDecisionStepIds.some((id) => changed.has(id))) {
        checkIds.add(c.checkId);
        c.invalidatesCheckIds.forEach((id) => checkIds.add(id));
        c.supportsDecisionStepIds.forEach((id) => stepIds.add(id));
      }
    }
    for (const a of s.humanActions) {
      if (changed.has(s.contractId) || changed.has(a.targetStepId)) actionIds.add(a.actionId);
    }
  }
  return { checkIds: [...checkIds], actionIds: [...actionIds], stepIds: [...stepIds].filter((id) => !changed.has(id)) };
}

/** Apply targeted invalidation: only dependents lose their confirmed status; unrelated confirmed work is preserved. */
export function invalidateDependents(bp: Blueprint, changedStepIds: string[]): { blueprint: Blueprint; invalidated: string[] } {
  const deps = dependentsOf(bp, changedStepIds);
  const invalidated: string[] = [];
  const steps = bp.steps.map((s) => {
    const touched = changedStepIds.includes(s.contractId) || deps.stepIds.includes(s.contractId);
    const checks = s.checks.map((c) => (deps.checkIds.includes(c.checkId) && c.reviewStatus === "confirmed" ? (invalidated.push(c.checkId), { ...c, reviewStatus: "open" as ReviewStatus }) : c));
    const humanActions = s.humanActions.map((a) => (deps.actionIds.includes(a.actionId) && a.reviewStatus === "confirmed" ? (invalidated.push(a.actionId), { ...a, reviewStatus: "open" as ReviewStatus }) : a));
    const status: ReviewStatus = touched && s.status === "confirmed" ? (invalidated.push(s.contractId), "open") : s.status;
    return { ...s, checks, humanActions, status };
  });
  return { blueprint: { ...bp, steps }, invalidated };
}

// ---------------------------------------------------------------------------
// Design contract export (Technical Spec handoff)
// ---------------------------------------------------------------------------

export function buildDesignContract(bp: Blueprint, stateRevision: number) {
  const dc = designCompletionSummary(bp);
  return {
    schema: DESIGN_SCHEMA,
    workflowId: bp.workflowId,
    workflowVersion: bp.version,
    sourceStateRevision: stateRevision,
    mode: bp.mode,
    designCompletion: dc,
    handoff: { technical: technicalHandoffReadiness(bp), commandCenter: commandCenterHandoffReadiness(bp) },
    valueNorthStar: bp.valueNorthStar,
    phases: bp.phases,
    steps: activeSteps(bp).map((s) => ({
      contractId: s.contractId,
      phase: s.phase,
      name: s.name,
      owner: s.owner,
      lane: s.lane,
      type: s.type,
      purpose: s.purpose,
      trigger: s.trigger,
      inputs: s.inputs,
      aiRole: s.aiRole,
      humanAuthority: s.humanAuthority,
      systems: s.systems,
      reads: s.reads,
      writes: s.writes,
      writeback: s.writeback,
      exceptions: s.exceptions,
      rerun: s.rerun,
      outcome: s.outcome,
      rules: s.rules,
      checks: s.checks,
      humanActions: s.humanActions,
      authority: s.authority,
      implementation: s.implementation,
      currentAiRefs: s.currentAiRefs,
      evidenceRefs: s.evidenceRefs,
      reviewStatus: s.status,
    })),
    currentAi: bp.currentAi,
    referenceArchitecture: bp.referenceArchitecture,
  };
}
