/**
 * AI Delivery Factory — authoritative schema.
 *
 * Everything the Factory treats as durable truth is typed here. The Factory State
 * is the lifecycle authority; the Runtime Context is a projection of it and never
 * carries independent truth (see projection.ts).
 */

export const FACTORY_VERSION = "1.4-rc4";
export const STATE_SCHEMA = "ai-delivery-factory-state-v1.4-rc4";
export const RUNTIME_SCHEMA = "ai-delivery-factory-runtime-v1.4-rc4";
export const PROJECTION_CONTRACT_VERSION = "1.0";
export const RELEASE_STATUS = "Candidate";
export const CERTIFIED_ROLLBACK_BASELINE = "1.3";

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export const LIFECYCLE_STAGES = [
  "DISCOVERY",
  "BASELINE_DESIGN",
  "BASELINE_APPROVAL",
  "TARGET_PATH_SELECTION",
  "TARGET_DESIGN",
  "TARGET_DESIGN_APPROVAL",
  "EXPERIENCE",
  "INTEGRATION_DATA_READINESS",
  "TECHNICAL_DESIGN",
  "TRANSFORMATION_PLANNING",
  "BUILD_CONTRACT",
  "IMPLEMENTATION_READINESS",
  "CLIENT_SDLC",
  "IMPLEMENTATION_VALIDATION",
  "RELEASE_READINESS",
  "HYPERCARE",
  "OPERATE_CI",
] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const TARGET_DESIGN_MODES = [
  "NOT_SELECTED",
  "AI_NATIVE_REIMAGINED",
  "BASELINE_PRESERVED",
  "CLIENT_DIRECTED",
] as const;
export type TargetDesignMode = (typeof TARGET_DESIGN_MODES)[number];

export const EXPERIENCE_SUBSTAGES = [
  "EXPERIENCE_EVIDENCE_INTAKE",
  "EXPERIENCE_BASELINE_PROFILE",
  "EXPERIENCE_GENERATION",
  "EXPERIENCE_REVIEW",
] as const;
export type ExperienceSubstage = (typeof EXPERIENCE_SUBSTAGES)[number];
export type ExperienceReviewOutcome = "NOT_REVIEWED" | "APPROVED" | "CHANGES_REQUESTED";

export const STAGE_EXECUTION_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "INTERRUPTED",
  "REVIEW_READY",
  "IN_REVIEW",
  "CORRECTION_REQUIRED",
  "APPROVAL_PENDING",
  "COMPLETE",
] as const;
export type StageExecutionStatus = (typeof STAGE_EXECUTION_STATUSES)[number];

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

export const GATE_IDS = [
  "BASELINE_APPROVAL",
  "TARGET_PATH_SELECTION",
  "TARGET_DESIGN_APPROVAL",
  "INTEGRATION_DATA_READINESS",
  "TECHNICAL_DIRECTION_APPROVAL",
  "TRANSFORMATION_READINESS",
  "BUILD_CONTRACT_APPROVAL",
  "IMPLEMENTATION_READINESS",
  "TEST_READINESS",
  "PRODUCTION_READINESS",
  "HYPERCARE_EXIT",
  "OPERATE_READY",
] as const;
export type GateId = (typeof GATE_IDS)[number];
export type GateOutcome = "PASS" | "CONDITIONAL" | "BLOCKED";

export interface GateControlResult {
  controlId: string;
  description: string;
  materiality: "BLOCKING" | "ADVISORY";
  satisfied: boolean;
  detail: string;
}

export interface GateRequirementResult {
  requirementId: string;
  materiality: "BLOCKING" | "ADVISORY";
  status: EvidenceReadinessStatus;
  satisfied: boolean;
  detail: string;
}

export interface GateEvaluation {
  gateId: GateId;
  outcome: GateOutcome;
  evaluatedAt: string;
  evaluatedAtStateRevision: number;
  hardStops: string[];
  conditions: string[];
  controls: GateControlResult[];
  requirements: GateRequirementResult[];
  /** Human-readable: what would have to change for the gate to pass. */
  blockers: string[];
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const EVIDENCE_READINESS_STATUSES = [
  "SUFFICIENT",
  "PARTIAL",
  "REQUIRED",
  "TO_CONFIRM",
  "NOT_ASSESSED",
  "WAIVED",
  "NOT_APPLICABLE",
  "CONDITIONAL",
] as const;
export type EvidenceReadinessStatus = (typeof EVIDENCE_READINESS_STATUSES)[number];

export const EVIDENCE_TYPES = [
  "PROCESS_DOCUMENT",
  "POLICY_DOCUMENT",
  "INTERVIEW_NOTES",
  "SYSTEM_EXPORT",
  "PROCESS_MINING",
  "ARCHITECTURE_DOCUMENT",
  "API_SPECIFICATION",
  "REPOSITORY_CODE",
  "TEST_RESULTS",
  "RUNTIME_TRACE",
  "DEPLOYMENT_CONFIG",
  "SCREENSHOT",
  "DEVELOPER_STATEMENT",
  "DESIGN_DOCUMENT",
  "SIMULATION_RESULT",
  "BRAND_GUIDE",
  "DESIGN_SYSTEM",
  "CLIENT_CONFIRMATION",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export type EvidenceSourceClass =
  | "CLIENT_AUTHORITATIVE"
  | "CLIENT_INFORMAL"
  | "CONSULTANT_OBSERVATION"
  | "SYSTEM_OF_RECORD"
  | "SYNTHETIC_SIMULATION"
  | "THIRD_PARTY";

export type EvidenceAuthorityStatus = "CURRENT" | "SUPERSEDED" | "QUARANTINED" | "REJECTED";

export type SyntheticRule = "REAL_REQUIRED" | "SYNTHETIC_ALLOWED";

export interface EvidenceClaim {
  key: string;
  value: string;
}

export interface EvidenceRecord {
  evidenceRef: string; // EV-###
  engagementId: string;
  workflowId: string;
  title: string;
  evidenceType: EvidenceType;
  sourceClass: EvidenceSourceClass;
  authorityStatus: EvidenceAuthorityStatus;
  synthetic: boolean;
  environment: "PRODUCTION" | "UAT" | "DEV" | "SANDBOX" | "NONE";
  capturedAt: string;
  expiresAt?: string;
  supersededBy?: string;
  requirementIds: string[];
  scope: string; // e.g. "WORKFLOW", "STEP:WF-003", "INTEGRATION:INT-002"
  claims: EvidenceClaim[];
  summary: string;
  /** Set when the record was quarantined for belonging to another engagement. */
  quarantineReason?: string;
}

export interface EvidenceRequirement {
  requirementId: string; // EVID-###
  description: string;
  purpose: string;
  owner: string;
  materiality: "BLOCKING" | "ADVISORY";
  requiredByGate: GateId;
  consequenceIfMissing: string;
  applicability: "APPLICABLE" | "NOT_APPLICABLE" | "TO_CONFIRM";
  allowedEvidenceTypes: EvidenceType[];
  allowedSourceClasses: EvidenceSourceClass[];
  requiredScope: string;
  minimumEvidenceCount: number;
  requiredClaims: string[];
  freshnessDays?: number;
  syntheticRule: SyntheticRule;
  waiverAuthority: ActorRole[];
  /** Deterministically computed by evidence.ts — never set by AI. */
  status: EvidenceReadinessStatus;
  statusDetail: string;
  lastAssessedAt?: string;
}

export const DISCOVERY_LAYERS = ["BUSINESS", "SYSTEM_INTERACTION", "IMPLEMENTATION_EVIDENCE"] as const;
export type DiscoveryLayer = (typeof DISCOVERY_LAYERS)[number];
export type DiscoverySufficiencyStatus = "SUFFICIENT" | "PARTIAL" | "REQUIRED" | "TO_CONFIRM";

export interface DiscoverySufficiency {
  layers: Record<DiscoveryLayer, { status: DiscoverySufficiencyStatus; detail: string }>;
  contradictions: Contradiction[];
  assessedAt?: string;
}

export interface Contradiction {
  contradictionId: string;
  topic: string;
  evidenceRefs: string[];
  description: string;
  status: "OPEN" | "RESOLVED";
  resolvedByDecisionId?: string;
}

// ---------------------------------------------------------------------------
// Human authority
// ---------------------------------------------------------------------------

export const ACTOR_ROLES = [
  "CONSULTANT",
  "DELIVERY_LEAD",
  "CLIENT_BUSINESS_OWNER",
  "CLIENT_PROCESS_OWNER",
  "CLIENT_ARCHITECT",
  "ARB",
  "SECURITY_PRIVACY",
  "CLIENT_IT_OPERATIONS",
  "AI_SPECIALIST",
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export interface Actor {
  userId: string;
  role: ActorRole;
  displayName?: string;
}

export const DECISION_TYPES = [
  "APPROVE",
  "REJECT",
  "REQUEST_CHANGES",
  "WAIVE",
  "NOT_APPLICABLE",
  "SELECT_TARGET_PATH",
  "ACCEPT_CONDITIONAL",
  "ANSWER",
  "CORRECT",
  "RESOLVE_CONTRADICTION",
  "ACCEPT_RECOMMENDATION",
] as const;
export type DecisionType = (typeof DECISION_TYPES)[number];

export type TargetObjectType =
  | "GATE"
  | "STAGE"
  | "WORKFLOW_STEP"
  | "WORKFLOW"
  | "DECISION"
  | "ARTIFACT"
  | "EVIDENCE_REQUIREMENT"
  | "OPEN_ITEM"
  | "CONTRADICTION"
  | "RECOMMENDATION"
  | "SIMULATION"
  | "VALUE_NORTH_STAR"
  | "EXPERIENCE"
  | "TARGET_PATH"
  | "INTEGRATION"
  | "BUILD_CONTRACT";

export interface TargetObject {
  type: TargetObjectType;
  id: string;
  revision?: string | number;
}

export interface HumanDecision {
  decisionId: string; // DEC-###
  engagementId: string;
  stage: LifecycleStage;
  type: DecisionType;
  target: TargetObject;
  actor: Actor;
  rationale: string;
  payload?: Record<string, unknown>;
  decidedAt: string;
  stateRevisionAtDecision: number;
  /** Optional link to the AI recommendation the decision responded to. */
  recommendationRef?: string;
}

export interface PendingHumanDecision {
  requestId: string; // REQ-###
  title: string;
  question: string;
  stage: LifecycleStage;
  target: TargetObject;
  allowedRoles: ActorRole[];
  allowedTypes: DecisionType[];
  /** AI recommendation, clearly separated from the deterministic and human layers. */
  recommendation?: Recommendation;
  requestedAt: string;
  requestedBy: "AI" | "CONTROL_PLANE" | "HUMAN";
  status: "PENDING" | "RESOLVED";
  resolvedByDecisionId?: string;
}

export interface Recommendation {
  recommendationRef: string; // REC-###
  summary: string;
  rationale: string;
  source: "AI_SPECIALIST" | "CONTROL_PLANE";
  specialistId?: string;
  confidence?: "LOW" | "MEDIUM" | "HIGH";
  producedAt: string;
  sourceStateRevision: number;
}

export interface Waiver {
  waiverId: string; // WAIV-###
  engagementId: string;
  stage: LifecycleStage;
  gateId: GateId;
  requirementId: string;
  decisionId: string; // must reference a HumanDecision of type WAIVE
  authorizedRole: ActorRole;
  rationale: string;
  evidenceRefs: string[];
  grantedAt: string;
  reviewBy: string;
  expiresAt: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
}

export interface GovernedNotApplicable {
  requirementId: string;
  decisionId: string; // HumanDecision of type NOT_APPLICABLE
  authorizedRole: ActorRole;
  rationale: string;
  stage: LifecycleStage;
  gateId: GateId;
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export type ArtifactAuthority = "CURRENT_AUTHORITATIVE" | "REVIEW_SNAPSHOT" | "SUPERSEDED" | "REFERENCE_ONLY";

export const ARTIFACT_KINDS = [
  "EVIDENCE_CATALOG",
  "CURRENT_STATE_BASELINE",
  "WORKFLOW_BLUEPRINT",
  "DESIGN_CONTRACT",
  "EXPERIENCE_PACK",
  "INTEGRATION_DATA_CONTRACT",
  "TECHNICAL_SPEC_HANDOFF",
  "CONTROLLED_TECHNICAL_DESIGN",
  "TRANSFORMATION_PLAN",
  "BUILD_CONTRACT",
  "REPOSITORY_REALIZATION_PLAN",
  "IMPLEMENTATION_EVIDENCE",
  "CODE_VALIDATION_REPORT",
  "RELEASE_READINESS_EVIDENCE",
  "SIMULATION_PACK",
  "DISCOVERY_STARTER_PACK",
  "SPECIALIST_RECOMMENDATION",
  "RESUME_MANIFEST",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export interface ArtifactRevision {
  artifactId: string; // ART-###
  kind: ArtifactKind;
  title: string;
  version: string; // semantic-ish "0.3.0"
  authority: ArtifactAuthority;
  reviewStatus: "OPEN" | "IN_REVIEW" | "CONFIRMED" | "CHANGES_REQUESTED";
  createdAt: string;
  createdAtStateRevision: number;
  producedBy: "HUMAN" | "AI_SPECIALIST" | "CONTROL_PLANE" | "DETERMINISTIC_SERVICE";
  specialistId?: string;
  upstream: { artifactId: string; version: string }[];
  supersedes?: string;
  supersededBy?: string;
  evidenceClass: "REAL" | "SYNTHETIC_SIMULATION" | "AI_GENERATED" | "DERIVED";
  /** Key into state.artifactContent when the body lives in state. */
  contentKey?: string;
  summary: string;
}

// ---------------------------------------------------------------------------
// Open items, history, jobs, checkpoints
// ---------------------------------------------------------------------------

export interface OpenItem {
  itemId: string; // TC-###
  kind: "TO_CONFIRM" | "BLOCKER" | "RISK" | "QUESTION";
  title: string;
  detail: string;
  owner: string;
  stage: LifecycleStage;
  relatedIds: string[];
  status: "OPEN" | "RESOLVED";
  raisedAt: string;
  resolvedByDecisionId?: string;
  answer?: string;
}

export const EVENT_TYPES = [
  "ENGAGEMENT_STARTED",
  "ENGAGEMENT_RESUMED",
  "EVIDENCE_INGESTED",
  "EVIDENCE_QUARANTINED",
  "EVIDENCE_ASSESSED",
  "BASELINE_CREATED",
  "DECISION_REQUESTED",
  "DECISION_RECORDED",
  "WAIVER_GRANTED",
  "WORKFLOW_CHANGED",
  "ARCHITECTURE_UPDATED",
  "AGENT_PROPOSED",
  "ARTIFACT_REGISTERED",
  "ARTIFACT_SUPERSEDED",
  "GATE_EVALUATED",
  "STAGE_ADVANCED",
  "STAGE_EXECUTION_CHANGED",
  "TARGET_PATH_SELECTED",
  "BUILD_CONTRACT_GENERATED",
  "SIMULATION_STARTED",
  "SIMULATION_CHECKPOINTED",
  "SIMULATION_COMPLETED",
  "VALIDATION_COMPLETED",
  "BLOCKER_RAISED",
  "BLOCKER_CLEARED",
  "RELEASE_GATE_REACHED",
  "JOB_QUEUED",
  "JOB_CHECKPOINTED",
  "JOB_COMPLETED",
  "JOB_FAILED",
  "JOB_INTERRUPTED",
  "ENGAGEMENT_PAUSED",
  "USAGE_THROTTLE",
  "STATE_CORRECTED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface HistoryEvent {
  eventId: string; // EVT-###
  type: EventType;
  at: string;
  stateRevision: number;
  actor: Actor | { userId: "control-plane"; role: "CONTROL_PLANE" };
  summary: string;
  correlationId: string;
  refs: string[];
}

export type JobType =
  | "SPECIALIST_RUN"
  | "SIMULATION"
  | "EVIDENCE_INGEST"
  | "TECHNICAL_COMPILE"
  | "VALIDATION"
  | "BUILD_CONTRACT";
export type JobStatus = "QUEUED" | "RUNNING" | "CHECKPOINTED" | "INTERRUPTED" | "COMPLETE" | "FAILED";

export interface Job {
  jobId: string; // JOB-###
  engagementId: string;
  jobType: JobType;
  specialistId?: string;
  sourceStateRevision: number;
  sourceArtifactVersions: { artifactId: string; version: string }[];
  status: JobStatus;
  batch: { total: number; completed: number; unitIds: string[] };
  lastCheckpoint?: { at: string; unitId: string; completed: number };
  nextUnit?: string;
  resultArtifactRefs: string[];
  invalidatedBy: string[];
  queuedAt: string;
  updatedAt: string;
  error?: string;
  /** Model/compute telemetry for this job. */
  telemetry: { modelCalls: number; inputTokens: number; outputTokens: number; latencyMs: number; retries: number; cacheReadTokens: number };
}

export interface ResumeManifest {
  engagementId: string;
  currentStage: LifecycleStage;
  currentSubstage?: string;
  stateRevision: number;
  artifactVersions: { artifactId: string; version: string }[];
  unresolvedDecisions: string[];
  toConfirmItems: string[];
  nextHumanAction: NextHumanAction;
  lastCompletedJob?: string;
  nextResumableUnit?: string;
  uncommittedWork: boolean;
  latestCheckpointAt?: string;
  resumeStatus: "SAFE" | "UNCOMMITTED_WORK" | "INTERRUPTED_JOBS";
}

export interface NextHumanAction {
  title: string;
  detail: string;
  actionType: string;
  target?: TargetObject;
  allowedRoles: ActorRole[];
  route: string;
}

// ---------------------------------------------------------------------------
// Value North Star, experience, engagement setup
// ---------------------------------------------------------------------------

export interface ValueNorthStar {
  objective: string;
  primaryMetric: string;
  metricDefinition: string;
  measurementGranularity: string;
  unit: string;
  direction: "LOWER_IS_BETTER" | "HIGHER_IS_BETTER" | "TO_CONFIRM";
  startEvent: string;
  endEvent: string;
  baseline: string;
  target: string;
  owner: string;
  reportingCadence: string;
  secondaryMetrics: string[];
  reviewStatus: "OPEN" | "CONFIRMED";
}

export const EXPERIENCE_CLASSIFICATIONS = [
  "BRAND_MANDATORY",
  "DESIGN_SYSTEM_MANDATORY",
  "EXISTING_EXPERIENCE_BASELINE",
  "REFERENCE_PREFERENCE",
  "INSPIRATION_ONLY",
  "AVOID_PATTERN",
  "TO_CONFIRM",
  "ACCESSIBILITY_MANDATORY",
] as const;
export type ExperienceClassification = (typeof EXPERIENCE_CLASSIFICATIONS)[number];

export interface ExperienceNote {
  noteId: string; // EXP-NOTE-###
  classification: ExperienceClassification;
  statement: string;
  evidenceRefs: string[];
  affectsGovernance: boolean;
}

export interface ExperienceState {
  substage: ExperienceSubstage;
  notes: ExperienceNote[];
  reviewOutcome: ExperienceReviewOutcome;
  reviewDecisionId?: string;
  generatedPackArtifactId?: string;
}

export interface EngagementSetup {
  clientName: string;
  engagementName: string;
  workflowName: string;
  consultantRole: ActorRole;
  consultantName: string;
  clientObjective: string; // may be "TO_CONFIRM"
  industry?: string;
  createdAt: string;
}

export interface StandardsControlProfile {
  applicableControls: { controlId: string; name: string; applicability: "APPLICABLE" | "NOT_APPLICABLE" | "TO_CONFIRM"; owner: string }[];
}

export interface ITObservability {
  inheritsClientEcosystem: boolean;
  loggingPlatform: string;
  tracingPlatform: string;
  metricsPlatform: string;
  alertingPlatform: string;
  siemPlatform: string;
  incidentProcess: string;
  newParallelPlatformDecisionId?: string;
}

// ---------------------------------------------------------------------------
// Factory State (authoritative) and Runtime Context (projection)
// ---------------------------------------------------------------------------

export interface FactoryState {
  schema: typeof STATE_SCHEMA;
  factoryVersion: typeof FACTORY_VERSION;
  releaseStatus: typeof RELEASE_STATUS;
  certifiedRollbackBaseline: typeof CERTIFIED_ROLLBACK_BASELINE;
  engagement_id: string;
  workflowId: string;
  currentStage: LifecycleStage;
  targetDesignMode: TargetDesignMode;
  gates: Record<GateId, GateEvaluation | null>;
  clientApprovals: Partial<Record<GateId, { decisionId: string; approvedAt: string; actor: Actor }>>;
  standardsControlProfile: StandardsControlProfile;
  evidenceReadinessProfile: { requirements: EvidenceRequirement[] };
  evidenceCatalog: EvidenceRecord[];
  latestGateEvaluation: GateEvaluation | null;
  pendingHumanDecisions: PendingHumanDecision[];
  decisions: HumanDecision[];
  waivers: Waiver[];
  notApplicable: GovernedNotApplicable[];
  authoritativeArtifacts: ArtifactRevision[];
  /** Bodies of artifacts that live inside state (blueprint, contracts, reports). */
  artifactContent: Record<string, unknown>;
  openItems: OpenItem[];
  lastRun: { at: string; actionType: string; correlationId: string; summary: string } | null;
  history: HistoryEvent[];
  activeStageExecution: { stage: LifecycleStage; status: StageExecutionStatus; startedAt: string; updatedAt: string };
  activeStageReview: { stage: LifecycleStage; snapshotArtifactId?: string; status: "NONE" | "IN_REVIEW" | "APPROVED" | "CHANGES_REQUESTED" };
  experience: ExperienceState;
  discoverySufficiency: DiscoverySufficiency;
  itObservability: ITObservability;
  artifactAuthorityModel: { states: ArtifactAuthority[]; rule: string };
  stateRevision: number;
  stateUpdatedAt: string;
  stateProjectionContractVersion: typeof PROJECTION_CONTRACT_VERSION;
  lifecycleEvidence: Partial<Record<LifecycleStage, { enteredAt: string; enteredAtRevision: number; byDecisionId?: string }>>;
  engagementSetup: EngagementSetup;
  valueNorthStar: ValueNorthStar;
  jobs: Job[];
  checkpoints: { checkpointId: string; at: string; stateRevision: number; note: string }[];
  /** Monotonic counters for stable IDs. */
  counters: Record<string, number>;
}

export interface RuntimeContext {
  schema: typeof RUNTIME_SCHEMA;
  engagement_id: string;
  workflowId: string;
  projection_of_state_revision: number;
  projectedAt: string;
  currentStage: LifecycleStage;
  stageIndex: number;
  stageExecutionStatus: StageExecutionStatus;
  targetDesignMode: TargetDesignMode;
  nextHumanAction: NextHumanAction;
  currentGate: { gateId: GateId; outcome: GateOutcome; blockers: string[] } | null;
  evidenceReadiness: { sufficient: number; partial: number; required: number; toConfirm: number; notAssessed: number; waived: number; notApplicable: number; blockingOpen: number };
  blockers: string[];
  pendingDecisionCount: number;
  toConfirmCount: number;
  artifactSummary: { artifactId: string; kind: ArtifactKind; title: string; version: string; authority: ArtifactAuthority }[];
  resume: ResumeManifest;
  recentChanges: HistoryEvent[];
  valueNorthStar: { primaryMetric: string; reviewStatus: string; ready: boolean };
  discoverySufficiency: DiscoverySufficiency["layers"];
}
