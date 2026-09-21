/**
 * Build Engine — compiles the approved design into a repository-independent Build Contract.
 * Authority order: design semantics > technical design > readiness decisions > repository reality.
 */

import { activeSteps, type Blueprint, type WorkflowStep } from "./blueprint";
import type { IntegrationDataContract } from "./integration";

export interface BuildUnit {
  unitId: string; // BU-WF-003
  objective: string;
  sourceStepId: string;
  targetTreatment: string;
  reuse: string[];
  extendOrRefactor: string[];
  netNew: string[];
  doNotReplace: string[];
  architectureConstraints: string[];
  systems: string[];
  reads: string[];
  writes: string[];
  rules: { ruleId: string; statement: string; hardStop: boolean }[];
  humanActions: { actionId: string; name: string; actor: string; nextState: string }[];
  checksExecutedHere: { checkId: string; name: string; expectedResult: string }[];
  preparedInputs: { checkId: string; forDecisionStepIds: string[] }[];
  validatedOutputsConsumedHere: { checkId: string; fromStepId: string }[];
  authority: WorkflowStep["authority"];
  rerunRecovery: string;
  arb: { reviewRequired: string; topics: string[] };
  acceptanceCriteria: string[];
  checkTests: string[];
  actionAuditTests: string[];
  unresolvedDecisions: string[];
  sourceTraceability: { stepId: string; ruleIds: string[]; checkIds: string[]; actionIds: string[]; evidenceRefs: string[] };
}

export interface BuildContract {
  schema: "ai-delivery-build-contract-v1";
  version: string;
  sourceWorkflowVersion: string;
  sourceTechnicalDesignVersion: string;
  sourceIntegrationContractVersion: string;
  authorityOrder: string[];
  units: BuildUnit[];
  continuousImprovementUnit: BuildUnit;
  codingPartnerProtocol: string[];
  generatedAt: string;
}

export interface RepositoryRealizationPlan {
  schema: "ai-delivery-repository-realization-plan-v1";
  buildContractVersion: string;
  reuse: string[];
  extendOrRefactor: string[];
  additions: string[];
  tests: string[];
  conflicts: { unitId: string; description: string; status: "OPEN" | "RETURNED_TO_FACTORY" | "RESOLVED"; resolutionDecisionId?: string }[];
  submittedBy: string;
  submittedAt: string;
}

function unitFor(step: WorkflowStep, bp: Blueprint, idc?: IntegrationDataContract): BuildUnit {
  const impl = step.implementation;
  const unresolved: string[] = [];
  if (impl.targetState.treatment === "TO_CONFIRM") unresolved.push("Implementation treatment TO_CONFIRM");
  if (step.authority.autonomyLevel === "TBD") unresolved.push("AI authority unresolved");
  step.rules.filter((r) => r.provenance.status === "UNCONFIRMED" || r.provenance.status === "DISPUTED").forEach((r) => unresolved.push(`Rule ${r.ruleId} provenance ${r.provenance.status}`));
  const consumed = activeSteps(bp)
    .flatMap((s) => s.checks.map((c) => ({ c, s })))
    .filter(({ c, s }) => s.contractId !== step.contractId && c.supportsDecisionStepIds.includes(step.contractId))
    .map(({ c, s }) => ({ checkId: c.checkId, fromStepId: s.contractId }));
  const integrations = idc?.integrations.filter((i) => i.workflowStepIds.includes(step.contractId)) ?? [];
  const constraints = [
    ...(impl.targetState.dependencies.map((d) => `Depends on ${d}`)),
    ...integrations.map((i) => `${i.integrationId} ${i.name}: ${i.modes.join("/")} · readiness ${i.readiness} · ${i.mockability}`),
  ];
  return {
    unitId: `BU-${step.contractId}`,
    objective: step.purpose,
    sourceStepId: step.contractId,
    targetTreatment: impl.targetState.treatment,
    reuse: ["KEEP", "REUSE"].includes(impl.targetState.treatment) ? impl.currentState.services : [],
    extendOrRefactor: ["EXTEND", "REFACTOR", "HARDEN"].includes(impl.targetState.treatment) ? impl.currentState.services : [],
    netNew: ["BUILD_NEW", "REPLACE"].includes(impl.targetState.treatment) ? impl.targetState.services : impl.targetState.services.filter((s) => !impl.currentState.services.includes(s)),
    doNotReplace: impl.targetState.doNotReplace,
    architectureConstraints: constraints,
    systems: step.systems,
    reads: step.reads,
    writes: step.writes,
    rules: step.rules.map((r) => ({ ruleId: r.ruleId, statement: r.statement, hardStop: r.hardStop })),
    humanActions: step.humanActions.map((a) => ({ actionId: a.actionId, name: a.name, actor: a.actor, nextState: a.nextState })),
    checksExecutedHere: step.checks.map((c) => ({ checkId: c.checkId, name: c.name, expectedResult: c.expectedResult })),
    preparedInputs: step.checks.filter((c) => c.supportsDecisionStepIds.length).map((c) => ({ checkId: c.checkId, forDecisionStepIds: c.supportsDecisionStepIds })),
    validatedOutputsConsumedHere: consumed,
    authority: step.authority,
    rerunRecovery: step.rerun,
    arb: { reviewRequired: impl.arbImpact.reviewRequired, topics: impl.arbImpact.topics },
    acceptanceCriteria: [
      `Outcome "${step.outcome}" is produced and persisted`,
      ...step.rules.filter((r) => r.hardStop).map((r) => `Hard stop ${r.ruleId} halts progression and routes per fail behaviour`),
      ...(step.authority.aiCanAdvance === false ? ["AI never advances the workflow state; a recorded human action does"] : []),
      ...(step.authority.aiCanWriteback === false ? ["No AI-initiated writeback to source systems"] : []),
    ],
    checkTests: step.checks.map((c) => `${c.checkId}: given ${c.inputsEvidence || "inputs"}, expect ${c.expectedResult}; on fail ${c.failAction}`),
    actionAuditTests: step.humanActions.map((a) => `${a.actionId}: recorded with actor, timestamp, precondition snapshot; ${a.auditRequirements || "audit trail required"}`),
    unresolvedDecisions: unresolved,
    sourceTraceability: {
      stepId: step.contractId,
      ruleIds: step.rules.map((r) => r.ruleId),
      checkIds: step.checks.map((c) => c.checkId),
      actionIds: step.humanActions.map((a) => a.actionId),
      evidenceRefs: step.evidenceRefs,
    },
  };
}

export function generateBuildContract(bp: Blueprint, versions: { technical: string; integration: string }, idc: IntegrationDataContract | undefined, now: string): BuildContract {
  const units = activeSteps(bp).map((s) => unitFor(s, bp, idc));
  const ci: BuildUnit = {
    ...unitFor(
      {
        ...activeSteps(bp)[0],
        contractId: "WF-CI",
        purpose: "Cross-cutting continuous-improvement and control-plane instrumentation: governed value and operational telemetry plus an Admin / Process Owner experience.",
        rules: [],
        checks: [],
        humanActions: [],
        systems: [],
        reads: [],
        writes: [],
        evidenceRefs: [],
      },
      bp,
      idc,
    ),
    unitId: "BU-CI",
    targetTreatment: "BUILD_NEW",
    netNew: ["Value North Star event emitter", "Operational telemetry (reuses client observability)", "Process Owner improvement inbox"],
    acceptanceCriteria: [
      `Emits ${bp.valueNorthStar.primaryMetric || "primary metric"} start/end events with correlation IDs`,
      "Operational and business telemetry planes are separate but share correlation IDs",
      "Improvement recommendations are recorded as proposals; approved design is never rewritten automatically",
    ],
    unresolvedDecisions: [],
  };
  return {
    schema: "ai-delivery-build-contract-v1",
    version: `${bp.version}-bc1`,
    sourceWorkflowVersion: bp.version,
    sourceTechnicalDesignVersion: versions.technical,
    sourceIntegrationContractVersion: versions.integration,
    authorityOrder: [
      "1. Technical Spec Handoff / approved design semantics",
      "2. Controlled Technical Design / architecture constraints",
      "3. Readiness decisions and approved dependencies",
      "4. Repository reality discovered by the coding partner (refines physical realization; never silently changes approved intent)",
    ],
    units,
    continuousImprovementUnit: ci,
    codingPartnerProtocol: [
      "Produce a Repository Realization Plan before coding: reuse, extension/refactor, additions, tests, conflicts.",
      "Return every conflict with this Build Contract to the Factory; do not resolve it silently.",
      "Keep canonical check IDs and human action IDs in code, tests and telemetry.",
    ],
    generatedAt: now,
  };
}

/** Build Contract certification — internal validity only. Missing repository evidence never invalidates a contract. */
export function certifyBuildContract(bc: BuildContract | undefined): { outcome: "PASS" | "FAIL"; findings: string[] } {
  if (!bc) return { outcome: "FAIL", findings: ["No Build Contract"] };
  const findings: string[] = [];
  for (const u of [...bc.units, bc.continuousImprovementUnit]) {
    for (const c of u.checksExecutedHere) {
      const prefix = c.checkId.replace(/-C\d+$/, "");
      if (u.sourceStepId !== "WF-CI" && prefix !== u.sourceStepId) findings.push(`${u.unitId}: check ${c.checkId} prefix does not match execution step ${u.sourceStepId}`);
    }
    if (!u.acceptanceCriteria.length) findings.push(`${u.unitId}: no acceptance criteria`);
    if (u.targetTreatment === "TO_CONFIRM") findings.push(`${u.unitId}: treatment TO_CONFIRM`);
    if (u.unresolvedDecisions.length) findings.push(`${u.unitId}: ${u.unresolvedDecisions.length} unresolved decision(s) — must not be hard-coded`);
    if (["KEEP", "REUSE"].includes(u.targetTreatment) && u.netNew.length) findings.push(`${u.unitId}: KEEP/REUSE unit declares net-new components`);
  }
  const ids = new Set<string>();
  for (const u of bc.units) {
    if (ids.has(u.sourceStepId)) findings.push(`Duplicate unit for ${u.sourceStepId}`);
    ids.add(u.sourceStepId);
  }
  return { outcome: findings.length ? "FAIL" : "PASS", findings };
}
