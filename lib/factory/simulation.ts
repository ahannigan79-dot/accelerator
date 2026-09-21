/**
 * Simulation Engine — every output is evidenceClass SYNTHETIC_SIMULATION.
 * Simulation raises confidence and finds design defects; it never manufactures real evidence
 * and never grants approval. Batches checkpoint after each scenario and resume without rerunning
 * unaffected completed scenarios.
 */

import { activeSteps, type Blueprint, type WorkflowStep } from "./blueprint";
import type { BuildContract } from "./build";

export const SIMULATION_MODES = [
  "BUSINESS_WORKFLOW_VALIDATION",
  "BUILD_CONTRACT_SIMULATION",
  "INTEGRATION_SANDBOX",
  "AGENT_BEHAVIOR_AUTHORITY",
  "FAILURE_CHAOS",
  "PERSONA_ACCESS",
  "RESPONSIBLE_AI_ADVERSARIAL",
  "SYNTHETIC_DATA",
  "OBSERVABILITY_REPLAY",
  "RELEASE_REHEARSAL",
] as const;
export type SimulationMode = (typeof SIMULATION_MODES)[number];

export const MODE_PREFIX: Record<SimulationMode, string> = {
  BUSINESS_WORKFLOW_VALIDATION: "SIM-BIZ",
  BUILD_CONTRACT_SIMULATION: "SIM-CONTRACT",
  INTEGRATION_SANDBOX: "SIM-INT",
  AGENT_BEHAVIOR_AUTHORITY: "SIM-AGENT",
  FAILURE_CHAOS: "SIM-CHAOS",
  PERSONA_ACCESS: "SIM-PERSONA",
  RESPONSIBLE_AI_ADVERSARIAL: "SIM-RAI",
  SYNTHETIC_DATA: "SIM-DATA",
  OBSERVABILITY_REPLAY: "SIM-OBS",
  RELEASE_REHEARSAL: "SIM-REL",
};

export type ScenarioResult = "PASS" | "FAIL" | "BLOCKED_INPUT" | "NOT_RUN" | "PARTIAL";
export type BusinessFeedback = "CONFIRMS_DESIGN" | "NEEDS_CHANGE" | "UNSURE";

export interface Scenario {
  scenarioId: string;
  mode: SimulationMode;
  title: string;
  stepId: string;
  trigger: string;
  actors: string[];
  aiActions: string[];
  deterministicControls: string[];
  humanDecisions: string[];
  exceptions: string[];
  expectedOutcome: string;
  valueEffect: string;
  sourceIds: string[]; // step/rule/check/action IDs this scenario depends on
  /** The deterministic question the runner evaluates against the design. */
  probe: { kind: "AUTHORITY_VIOLATION" | "HARD_STOP" | "HUMAN_ACTION" | "CHECK_CONSUMPTION" | "STANDARD_PATH" | "WRITEBACK" | "RERUN" | "CONTRACT_UNIT"; ref?: string };
}

export interface ScenarioRun {
  scenarioId: string;
  result: ScenarioResult;
  evidenceClass: "SYNTHETIC_SIMULATION";
  trace: string[];
  authorityViolations: string[];
  ranAt: string;
  sourceVersion: string;
  feedback?: { value: BusinessFeedback; by: string; note: string; at: string };
}

export interface SimulationPack {
  schema: "ai-delivery-simulation-pack-v1";
  packId: string;
  mode: SimulationMode;
  sourceWorkflowVersion: string;
  sourceStateRevision: number;
  evidenceClass: "SYNTHETIC_SIMULATION";
  scenarios: Scenario[];
  runs: Record<string, ScenarioRun>;
  batch: { total: number; completed: number; nextUnit?: string; checkpointAt?: string; status: "QUEUED" | "RUNNING" | "CHECKPOINTED" | "COMPLETE" | "INTERRUPTED" };
  warning: string;
}

const WARNING = "Every result in this pack is SYNTHETIC_SIMULATION. A PASS means expected simulated behaviour occurred under recorded synthetic conditions. It cannot establish real integration, UAT, deployment, production readiness or release approval.";

function sid(mode: SimulationMode, n: number): string {
  return `${MODE_PREFIX[mode]}-${String(n).padStart(3, "0")}`;
}

export function generateScenarios(bp: Blueprint, mode: SimulationMode, bc?: BuildContract): Scenario[] {
  const steps = activeSteps(bp);
  const out: Scenario[] = [];
  let n = 0;
  const base = (s: WorkflowStep, title: string, probe: Scenario["probe"], extras: Partial<Scenario> = {}): Scenario => ({
    scenarioId: sid(mode, ++n),
    mode,
    title,
    stepId: s.contractId,
    trigger: s.trigger,
    actors: [s.owner],
    aiActions: s.aiRole ? [s.aiRole] : [],
    deterministicControls: s.rules.filter((r) => r.ruleType === "Deterministic").map((r) => r.statement),
    humanDecisions: s.humanActions.map((a) => a.name),
    exceptions: s.exceptions ? [s.exceptions] : [],
    expectedOutcome: s.outcome,
    valueEffect: `Contributes to ${bp.valueNorthStar.primaryMetric || "primary metric"}`,
    sourceIds: [s.contractId, ...s.rules.map((r) => r.ruleId), ...s.checks.map((c) => c.checkId), ...s.humanActions.map((a) => a.actionId)],
    probe,
    ...extras,
  });
  if (mode === "BUSINESS_WORKFLOW_VALIDATION") {
    for (const s of steps) {
      out.push(base(s, `Standard path: ${s.name}`, { kind: "STANDARD_PATH" }));
      for (const r of s.rules.filter((x) => x.hardStop)) out.push(base(s, `Hard stop: ${r.statement.slice(0, 70)}`, { kind: "HARD_STOP", ref: r.ruleId }, { exceptions: [r.statement] }));
      for (const a of s.humanActions) out.push(base(s, `Human action: ${a.name}`, { kind: "HUMAN_ACTION", ref: a.actionId }));
    }
  } else if (mode === "AGENT_BEHAVIOR_AUTHORITY") {
    for (const s of steps.filter((x) => x.type === "ai" || x.type === "mixed")) {
      out.push(base(s, `AI attempts to advance workflow at ${s.name}`, { kind: "AUTHORITY_VIOLATION", ref: "advance" }));
      out.push(base(s, `AI attempts writeback at ${s.name}`, { kind: "WRITEBACK", ref: "writeback" }));
    }
  } else if (mode === "BUILD_CONTRACT_SIMULATION") {
    for (const u of bc?.units ?? []) {
      const s = steps.find((x) => x.contractId === u.sourceStepId);
      if (s) out.push(base(s, `Build unit ${u.unitId}: acceptance criteria`, { kind: "CONTRACT_UNIT", ref: u.unitId }));
      for (const c of s?.checks ?? []) out.push(base(s!, `Check consumption ${c.checkId}`, { kind: "CHECK_CONSUMPTION", ref: c.checkId }));
    }
  } else if (mode === "FAILURE_CHAOS") {
    for (const s of steps.filter((x) => x.systems.length)) out.push(base(s, `${s.systems[0]} unavailable during ${s.name}`, { kind: "RERUN" }, { exceptions: [`${s.systems[0]} unavailable`] }));
  } else {
    for (const s of steps) out.push(base(s, `${mode.replaceAll("_", " ").toLowerCase()}: ${s.name}`, { kind: "STANDARD_PATH" }));
  }
  return out;
}

/** Deterministic evaluation of one scenario against the design model. */
export function runScenario(sc: Scenario, bp: Blueprint, bc: BuildContract | undefined, now: string): ScenarioRun {
  const step = activeSteps(bp).find((s) => s.contractId === sc.stepId);
  const trace: string[] = [];
  const violations: string[] = [];
  const done = (result: ScenarioResult): ScenarioRun => ({ scenarioId: sc.scenarioId, result, evidenceClass: "SYNTHETIC_SIMULATION", trace, authorityViolations: violations, ranAt: now, sourceVersion: bp.version });
  if (!step) {
    trace.push(`Step ${sc.stepId} not found in design`);
    return done("BLOCKED_INPUT");
  }
  trace.push(`Trigger: ${step.trigger}`);
  const a = step.authority;
  switch (sc.probe.kind) {
    case "STANDARD_PATH": {
      if (!step.outcome.trim()) {
        trace.push("No outcome defined");
        return done("BLOCKED_INPUT");
      }
      if (step.aiRole) trace.push(`AI: ${step.aiRole}`);
      trace.push(`Outcome: ${step.outcome}`);
      if (a.autonomyLevel === "TBD") {
        trace.push("Authority unresolved — outcome reached but authority cannot be asserted");
        return done("PARTIAL");
      }
      return done("PASS");
    }
    case "HARD_STOP": {
      const rule = step.rules.find((r) => r.ruleId === sc.probe.ref);
      if (!rule) return done("BLOCKED_INPUT");
      trace.push(`Rule ${rule.ruleId} violated in synthetic input`);
      const failPath = step.checks.some((c) => c.failAction.trim()) || step.exceptions.trim();
      if (!failPath) {
        trace.push("No fail behaviour or exception path defined for the hard stop");
        return done("FAIL");
      }
      if (a.aiCanAdvance === true) {
        violations.push(`AI can advance past hard stop ${rule.ruleId}`);
        return done("FAIL");
      }
      trace.push(`Routed: ${step.exceptions || "check fail behaviour"}`);
      return done("PASS");
    }
    case "HUMAN_ACTION": {
      const act = step.humanActions.find((x) => x.actionId === sc.probe.ref);
      if (!act) return done("BLOCKED_INPUT");
      trace.push(`${act.actor} performs ${act.name}`);
      if (!act.nextState.trim() || !act.actor.trim()) {
        trace.push("Action lacks actor or next state");
        return done("FAIL");
      }
      if (!act.auditRequirements.trim()) {
        trace.push("Audit requirements undefined");
        return done("PARTIAL");
      }
      trace.push(`Next state: ${act.nextState}`);
      return done("PASS");
    }
    case "AUTHORITY_VIOLATION": {
      trace.push("Synthetic AI attempts to advance the governed state without a human action");
      if (a.aiCanAdvance === null) return done("BLOCKED_INPUT");
      if (a.aiCanAdvance === true && a.humanApprovalRequired === "ALWAYS") {
        violations.push("aiCanAdvance=true contradicts humanApprovalRequired=ALWAYS");
        return done("FAIL");
      }
      if (a.aiCanAdvance === true && step.humanActions.length === 0 && step.rules.some((r) => r.hardStop)) {
        violations.push("AI may advance a step with hard-stop rules and no human action");
        return done("FAIL");
      }
      trace.push(a.aiCanAdvance ? "Bounded autonomy permitted by design" : "Advance rejected; human action required");
      return done("PASS");
    }
    case "WRITEBACK": {
      trace.push("Synthetic AI attempts a source-system write");
      if (a.aiCanWriteback === null) return done("BLOCKED_INPUT");
      if (a.aiCanWriteback && !step.writeback.trim()) {
        violations.push("AI writeback permitted without a declared writeback boundary");
        return done("FAIL");
      }
      trace.push(a.aiCanWriteback ? `Write bounded by: ${step.writeback}` : "Write rejected; no AI writeback authority");
      return done("PASS");
    }
    case "CHECK_CONSUMPTION": {
      const check = step.checks.find((c) => c.checkId === sc.probe.ref);
      if (!check) return done("BLOCKED_INPUT");
      const prefixOk = check.checkId.startsWith(check.execution.stepId) && check.execution.stepId === step.contractId;
      if (!prefixOk) {
        violations.push(`Canonical check invariant broken for ${check.checkId}`);
        return done("FAIL");
      }
      if (!check.supportsDecisionStepIds.length) {
        trace.push("Check has no downstream decision consumer");
        return done("PARTIAL");
      }
      trace.push(`Prepared at ${check.execution.stepId}; consumed by ${check.supportsDecisionStepIds.join(", ")}`);
      return done("PASS");
    }
    case "RERUN": {
      trace.push(`${step.systems[0]} unavailable`);
      if (!step.rerun.trim()) {
        trace.push("No rerun/recovery behaviour defined");
        return done("FAIL");
      }
      trace.push(`Recovery: ${step.rerun}`);
      return done("PASS");
    }
    case "CONTRACT_UNIT": {
      const u = bc?.units.find((x) => x.unitId === sc.probe.ref);
      if (!u) return done("BLOCKED_INPUT");
      if (u.unresolvedDecisions.length) {
        trace.push(`Unresolved: ${u.unresolvedDecisions.join("; ")}`);
        return done("PARTIAL");
      }
      trace.push(`${u.acceptanceCriteria.length} acceptance criteria evaluated synthetically`);
      return done("PASS");
    }
  }
}

export function createPack(bp: Blueprint, mode: SimulationMode, stateRevision: number, packId: string, bc?: BuildContract): SimulationPack {
  const scenarios = generateScenarios(bp, mode, bc);
  return {
    schema: "ai-delivery-simulation-pack-v1",
    packId,
    mode,
    sourceWorkflowVersion: bp.version,
    sourceStateRevision: stateRevision,
    evidenceClass: "SYNTHETIC_SIMULATION",
    scenarios,
    runs: {},
    batch: { total: scenarios.length, completed: 0, nextUnit: scenarios[0]?.scenarioId, status: scenarios.length ? "QUEUED" : "COMPLETE" },
    warning: WARNING,
  };
}

/** Run up to `limit` pending scenarios, checkpointing after each. Completed, unaffected scenarios are never rerun. */
export function runBatch(pack: SimulationPack, bp: Blueprint, bc: BuildContract | undefined, now: string, limit = Infinity): SimulationPack {
  const runs = { ...pack.runs };
  let ran = 0;
  for (const sc of pack.scenarios) {
    if (ran >= limit) break;
    const existing = runs[sc.scenarioId];
    if (existing && existing.sourceVersion === bp.version) continue;
    runs[sc.scenarioId] = runScenario(sc, bp, bc, now);
    ran++;
  }
  const completed = pack.scenarios.filter((s) => runs[s.scenarioId] && runs[s.scenarioId].sourceVersion === bp.version).length;
  const next = pack.scenarios.find((s) => !runs[s.scenarioId] || runs[s.scenarioId].sourceVersion !== bp.version)?.scenarioId;
  return {
    ...pack,
    sourceWorkflowVersion: bp.version,
    runs,
    batch: { total: pack.scenarios.length, completed, nextUnit: next, checkpointAt: now, status: next ? "CHECKPOINTED" : "COMPLETE" },
  };
}

/** Targeted invalidation: only runs whose source IDs intersect the changed IDs are dropped. */
export function invalidateRuns(pack: SimulationPack, changedIds: string[]): { pack: SimulationPack; invalidated: string[] } {
  const changed = new Set(changedIds);
  const runs = { ...pack.runs };
  const invalidated: string[] = [];
  for (const sc of pack.scenarios) {
    if (runs[sc.scenarioId] && sc.sourceIds.some((id) => changed.has(id))) {
      delete runs[sc.scenarioId];
      invalidated.push(sc.scenarioId);
    }
  }
  const completed = Object.keys(runs).length;
  const next = pack.scenarios.find((s) => !runs[s.scenarioId])?.scenarioId;
  return { pack: { ...pack, runs, batch: { ...pack.batch, completed, nextUnit: next, status: next ? "CHECKPOINTED" : "COMPLETE" } }, invalidated };
}

export function packSummary(pack: SimulationPack): Record<ScenarioResult, number> & { feedback: Record<BusinessFeedback, number> } {
  const s: Record<ScenarioResult, number> = { PASS: 0, FAIL: 0, BLOCKED_INPUT: 0, NOT_RUN: 0, PARTIAL: 0 };
  const feedback: Record<BusinessFeedback, number> = { CONFIRMS_DESIGN: 0, NEEDS_CHANGE: 0, UNSURE: 0 };
  for (const sc of pack.scenarios) {
    const r = pack.runs[sc.scenarioId];
    if (!r) s.NOT_RUN++;
    else {
      s[r.result]++;
      if (r.feedback) feedback[r.feedback.value]++;
    }
  }
  return { ...s, feedback };
}
