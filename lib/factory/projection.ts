/**
 * Runtime Context projection. Derived from Factory State; never independent truth.
 * If projection_of_state_revision != stateRevision the runtime is stale and governed transitions stop.
 */

import { valueMetricReady } from "./blueprint";
import { STAGE_EXIT_GATE } from "./gates";
import { deriveNextAction, stageIndex } from "./lifecycle";
import { RUNTIME_SCHEMA, type FactoryState, type ResumeManifest, type RuntimeContext } from "./schema";

export function buildResumeManifest(state: FactoryState): ResumeManifest {
  const interrupted = state.jobs.filter((j) => j.status === "INTERRUPTED" || j.status === "RUNNING");
  const checkpointed = state.jobs.filter((j) => j.status === "CHECKPOINTED");
  const lastCompleted = [...state.jobs].reverse().find((j) => j.status === "COMPLETE");
  const nextUnit = (interrupted[0] ?? checkpointed[0])?.nextUnit;
  const latestCheckpoint = state.checkpoints[state.checkpoints.length - 1];
  const uncommitted = latestCheckpoint ? latestCheckpoint.stateRevision < state.stateRevision : state.stateRevision > 0;
  return {
    engagementId: state.engagement_id,
    currentStage: state.currentStage,
    currentSubstage: state.currentStage === "EXPERIENCE" ? state.experience.substage : undefined,
    stateRevision: state.stateRevision,
    artifactVersions: state.authoritativeArtifacts.filter((a) => a.authority === "CURRENT_AUTHORITATIVE").map((a) => ({ artifactId: a.artifactId, version: a.version })),
    unresolvedDecisions: state.pendingHumanDecisions.filter((p) => p.status === "PENDING").map((p) => p.requestId),
    toConfirmItems: state.openItems.filter((o) => o.status === "OPEN" && o.kind === "TO_CONFIRM").map((o) => o.itemId),
    nextHumanAction: deriveNextAction(state),
    lastCompletedJob: lastCompleted?.jobId,
    nextResumableUnit: nextUnit,
    uncommittedWork: uncommitted,
    latestCheckpointAt: latestCheckpoint?.at,
    resumeStatus: interrupted.length ? "INTERRUPTED_JOBS" : uncommitted ? "UNCOMMITTED_WORK" : "SAFE",
  };
}

export function projectRuntime(state: FactoryState, now = new Date()): RuntimeContext {
  const reqs = state.evidenceReadinessProfile.requirements;
  const count = (s: string) => reqs.filter((r) => r.status === s).length;
  const gateId = STAGE_EXIT_GATE[state.currentStage];
  const gate = gateId ? state.gates[gateId] : null;
  const blockers = [
    ...(gate && gate.evaluatedAtStateRevision === state.stateRevision ? gate.hardStops : []),
    ...state.openItems.filter((o) => o.status === "OPEN" && o.kind === "BLOCKER").map((o) => o.title),
  ];
  return {
    schema: RUNTIME_SCHEMA,
    engagement_id: state.engagement_id,
    workflowId: state.workflowId,
    projection_of_state_revision: state.stateRevision,
    projectedAt: now.toISOString(),
    currentStage: state.currentStage,
    stageIndex: stageIndex(state.currentStage),
    stageExecutionStatus: state.activeStageExecution.status,
    targetDesignMode: state.targetDesignMode,
    nextHumanAction: deriveNextAction(state),
    currentGate: gate ? { gateId: gate.gateId, outcome: gate.outcome, blockers: gate.blockers } : null,
    evidenceReadiness: {
      sufficient: count("SUFFICIENT"),
      partial: count("PARTIAL"),
      required: count("REQUIRED"),
      toConfirm: count("TO_CONFIRM"),
      notAssessed: count("NOT_ASSESSED"),
      waived: count("WAIVED"),
      notApplicable: count("NOT_APPLICABLE"),
      blockingOpen: reqs.filter((r) => r.materiality === "BLOCKING" && !["SUFFICIENT", "WAIVED", "NOT_APPLICABLE"].includes(r.status)).length,
    },
    blockers,
    pendingDecisionCount: state.pendingHumanDecisions.filter((p) => p.status === "PENDING").length,
    toConfirmCount: state.openItems.filter((o) => o.status === "OPEN" && o.kind === "TO_CONFIRM").length,
    artifactSummary: state.authoritativeArtifacts.map((a) => ({ artifactId: a.artifactId, kind: a.kind, title: a.title, version: a.version, authority: a.authority })),
    resume: buildResumeManifest(state),
    recentChanges: state.history.slice(-8).reverse(),
    valueNorthStar: { primaryMetric: state.valueNorthStar.primaryMetric, reviewStatus: state.valueNorthStar.reviewStatus, ready: valueMetricReady(state.valueNorthStar) },
    discoverySufficiency: state.discoverySufficiency.layers,
  };
}

export function isRuntimeStale(state: FactoryState, runtime: RuntimeContext | null | undefined): boolean {
  return !runtime || runtime.projection_of_state_revision !== state.stateRevision || runtime.engagement_id !== state.engagement_id;
}
