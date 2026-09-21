/**
 * Factory State construction and the default evidence-requirement profile.
 */

import { assessAllRequirements, assessDiscoverySufficiency } from "./evidence";
import { nowIso, slugify } from "./ids";
import {
  CERTIFIED_ROLLBACK_BASELINE,
  FACTORY_VERSION,
  GATE_IDS,
  PROJECTION_CONTRACT_VERSION,
  RELEASE_STATUS,
  STATE_SCHEMA,
  type ActorRole,
  type EngagementSetup,
  type EvidenceRequirement,
  type FactoryState,
  type GateEvaluation,
  type GateId,
  type ValueNorthStar,
} from "./schema";

const LEAD_AND_OWNER: ActorRole[] = ["DELIVERY_LEAD", "CLIENT_BUSINESS_OWNER"];
const ARCHITECT: ActorRole[] = ["CLIENT_ARCHITECT", "ARB"];

function req(partial: Partial<EvidenceRequirement> & Pick<EvidenceRequirement, "requirementId" | "description" | "requiredByGate" | "materiality" | "allowedEvidenceTypes">): EvidenceRequirement {
  return {
    purpose: partial.description,
    owner: "Consultant",
    consequenceIfMissing: partial.materiality === "BLOCKING" ? `Gate ${partial.requiredByGate} stays BLOCKED` : `Gate ${partial.requiredByGate} is CONDITIONAL`,
    applicability: "APPLICABLE",
    allowedSourceClasses: ["CLIENT_AUTHORITATIVE", "SYSTEM_OF_RECORD"],
    requiredScope: "ANY",
    minimumEvidenceCount: 1,
    requiredClaims: [],
    syntheticRule: "REAL_REQUIRED",
    waiverAuthority: LEAD_AND_OWNER,
    status: "NOT_ASSESSED",
    statusDetail: "Not yet assessed",
    ...partial,
  };
}

export function defaultEvidenceRequirements(): EvidenceRequirement[] {
  return [
    req({ requirementId: "EVID-001", description: "Current-state process documentation", requiredByGate: "BASELINE_APPROVAL", materiality: "BLOCKING", allowedEvidenceTypes: ["PROCESS_DOCUMENT", "POLICY_DOCUMENT", "INTERVIEW_NOTES", "PROCESS_MINING"], allowedSourceClasses: ["CLIENT_AUTHORITATIVE", "CLIENT_INFORMAL", "CONSULTANT_OBSERVATION", "SYSTEM_OF_RECORD"], requiredScope: "WORKFLOW", owner: "Client process owner" }),
    req({ requirementId: "EVID-002", description: "Business rules and thresholds confirmed by the client", requiredByGate: "BASELINE_APPROVAL", materiality: "BLOCKING", allowedEvidenceTypes: ["POLICY_DOCUMENT", "CLIENT_CONFIRMATION"], owner: "Client business owner" }),
    req({ requirementId: "EVID-003", description: "Value North Star baseline measurement source", requiredByGate: "TARGET_DESIGN_APPROVAL", materiality: "ADVISORY", allowedEvidenceTypes: ["SYSTEM_EXPORT", "CLIENT_CONFIRMATION", "PROCESS_MINING"], owner: "Client business owner" }),
    req({ requirementId: "EVID-004", description: "Experience and brand baseline (classified experience evidence)", requiredByGate: "TARGET_DESIGN_APPROVAL", materiality: "ADVISORY", allowedEvidenceTypes: ["BRAND_GUIDE", "DESIGN_SYSTEM", "SCREENSHOT", "CLIENT_CONFIRMATION"], allowedSourceClasses: ["CLIENT_AUTHORITATIVE", "CLIENT_INFORMAL"], syntheticRule: "SYNTHETIC_ALLOWED", owner: "Consultant" }),
    req({ requirementId: "EVID-005", description: "System interaction evidence for every required integration", requiredByGate: "INTEGRATION_DATA_READINESS", materiality: "BLOCKING", allowedEvidenceTypes: ["ARCHITECTURE_DOCUMENT", "API_SPECIFICATION", "SYSTEM_EXPORT"], owner: "Client architect", waiverAuthority: ARCHITECT }),
    req({ requirementId: "EVID-006", description: "Client observability ecosystem confirmed (logging, tracing, metrics, alerting, SIEM, incident)", requiredByGate: "TECHNICAL_DIRECTION_APPROVAL", materiality: "ADVISORY", allowedEvidenceTypes: ["CLIENT_CONFIRMATION", "ARCHITECTURE_DOCUMENT"], owner: "Client IT operations", waiverAuthority: ARCHITECT }),
    req({ requirementId: "EVID-007", description: "Repository code or PR diff for every build unit", requiredByGate: "TEST_READINESS", materiality: "BLOCKING", allowedEvidenceTypes: ["REPOSITORY_CODE"], allowedSourceClasses: ["SYSTEM_OF_RECORD", "CLIENT_AUTHORITATIVE", "THIRD_PARTY"], requiredScope: "IMPLEMENTATION", owner: "Coding partner", waiverAuthority: ARCHITECT }),
    req({ requirementId: "EVID-008", description: "Automated test results", requiredByGate: "TEST_READINESS", materiality: "BLOCKING", allowedEvidenceTypes: ["TEST_RESULTS"], allowedSourceClasses: ["SYSTEM_OF_RECORD", "THIRD_PARTY"], requiredScope: "IMPLEMENTATION", owner: "Coding partner", waiverAuthority: ARCHITECT }),
    req({ requirementId: "EVID-009", description: "Integration runtime traces from a real (non-mock) environment", requiredByGate: "PRODUCTION_READINESS", materiality: "BLOCKING", allowedEvidenceTypes: ["RUNTIME_TRACE"], allowedSourceClasses: ["SYSTEM_OF_RECORD"], requiredScope: "INTEGRATION", owner: "Client IT operations", waiverAuthority: ["CLIENT_IT_OPERATIONS", "CLIENT_ARCHITECT"] }),
    req({ requirementId: "EVID-010", description: "Deployment evidence (config or runtime) from the target environment, at most 30 days old", requiredByGate: "PRODUCTION_READINESS", materiality: "BLOCKING", allowedEvidenceTypes: ["DEPLOYMENT_CONFIG", "RUNTIME_TRACE"], allowedSourceClasses: ["SYSTEM_OF_RECORD"], requiredScope: "DEPLOYMENT", freshnessDays: 30, owner: "Client IT operations", waiverAuthority: ["CLIENT_IT_OPERATIONS"] }),
    req({ requirementId: "EVID-011", description: "Security and privacy sign-off", requiredByGate: "PRODUCTION_READINESS", materiality: "BLOCKING", allowedEvidenceTypes: ["CLIENT_CONFIRMATION"], allowedSourceClasses: ["CLIENT_AUTHORITATIVE"], owner: "Security / privacy", waiverAuthority: ["SECURITY_PRIVACY"] }),
    req({ requirementId: "EVID-012", description: "Hypercare incident and exception log", requiredByGate: "HYPERCARE_EXIT", materiality: "ADVISORY", allowedEvidenceTypes: ["SYSTEM_EXPORT", "RUNTIME_TRACE"], owner: "Client IT operations" }),
    req({ requirementId: "EVID-013", description: "Value telemetry observed in production for the primary metric", requiredByGate: "OPERATE_READY", materiality: "BLOCKING", allowedEvidenceTypes: ["RUNTIME_TRACE", "SYSTEM_EXPORT"], allowedSourceClasses: ["SYSTEM_OF_RECORD"], owner: "Client process owner" }),
  ];
}

export function emptyValueNorthStar(): ValueNorthStar {
  return {
    objective: "TO_CONFIRM",
    primaryMetric: "TO_CONFIRM",
    metricDefinition: "",
    measurementGranularity: "TO_CONFIRM",
    unit: "TO_CONFIRM",
    direction: "TO_CONFIRM",
    startEvent: "TO_CONFIRM",
    endEvent: "TO_CONFIRM",
    baseline: "TO_CONFIRM",
    target: "TO_CONFIRM",
    owner: "TO_CONFIRM",
    reportingCadence: "TO_CONFIRM",
    secondaryMetrics: [],
    reviewStatus: "OPEN",
  };
}

export interface CreateEngagementInput {
  clientName: string;
  engagementName: string;
  workflowName: string;
  consultantName: string;
  consultantRole?: ActorRole;
  clientObjective?: string;
  industry?: string;
  engagementId?: string;
}

export function createEngagementState(input: CreateEngagementInput, at = nowIso()): FactoryState {
  const engagementId = input.engagementId ?? `ENG-${slugify(input.clientName).slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
  const workflowId = `${slugify(input.clientName).slice(0, 8)}-${slugify(input.workflowName)}`;
  const gates = Object.fromEntries(GATE_IDS.map((g) => [g, null])) as Record<GateId, GateEvaluation | null>;
  const setup: EngagementSetup = {
    clientName: input.clientName,
    engagementName: input.engagementName,
    workflowName: input.workflowName,
    consultantRole: input.consultantRole ?? "CONSULTANT",
    consultantName: input.consultantName,
    clientObjective: input.clientObjective?.trim() || "TO_CONFIRM",
    industry: input.industry,
    createdAt: at,
  };
  const state: FactoryState = {
    schema: STATE_SCHEMA,
    factoryVersion: FACTORY_VERSION,
    releaseStatus: RELEASE_STATUS,
    certifiedRollbackBaseline: CERTIFIED_ROLLBACK_BASELINE,
    engagement_id: engagementId,
    workflowId,
    currentStage: "DISCOVERY",
    targetDesignMode: "NOT_SELECTED",
    gates,
    clientApprovals: {},
    standardsControlProfile: {
      applicableControls: [
        { controlId: "STD-001", name: "Human approval on governed gates", applicability: "APPLICABLE", owner: "Delivery lead" },
        { controlId: "STD-002", name: "Client data isolation", applicability: "APPLICABLE", owner: "Delivery lead" },
        { controlId: "STD-003", name: "Responsible AI classification for every agent", applicability: "APPLICABLE", owner: "Client architect" },
        { controlId: "STD-004", name: "Regulatory / sector controls", applicability: "TO_CONFIRM", owner: "Client business owner" },
      ],
    },
    evidenceReadinessProfile: { requirements: defaultEvidenceRequirements() },
    evidenceCatalog: [],
    latestGateEvaluation: null,
    pendingHumanDecisions: [],
    decisions: [],
    waivers: [],
    notApplicable: [],
    authoritativeArtifacts: [],
    artifactContent: {},
    openItems: setup.clientObjective === "TO_CONFIRM" ? [{ itemId: "TC-001", kind: "TO_CONFIRM", title: "Client objective", detail: "Objective not stated at intake.", owner: "Client business owner", stage: "DISCOVERY", relatedIds: [], status: "OPEN", raisedAt: at }] : [],
    lastRun: null,
    history: [],
    activeStageExecution: { stage: "DISCOVERY", status: "IN_PROGRESS", startedAt: at, updatedAt: at },
    activeStageReview: { stage: "DISCOVERY", status: "NONE" },
    experience: { substage: "EXPERIENCE_EVIDENCE_INTAKE", notes: [], reviewOutcome: "NOT_REVIEWED" },
    discoverySufficiency: {
      layers: {
        BUSINESS: { status: "REQUIRED", detail: "No evidence recorded for this layer" },
        SYSTEM_INTERACTION: { status: "REQUIRED", detail: "No evidence recorded for this layer" },
        IMPLEMENTATION_EVIDENCE: { status: "REQUIRED", detail: "No evidence recorded for this layer" },
      },
      contradictions: [],
    },
    itObservability: { inheritsClientEcosystem: true, loggingPlatform: "TO_CONFIRM", tracingPlatform: "TO_CONFIRM", metricsPlatform: "TO_CONFIRM", alertingPlatform: "TO_CONFIRM", siemPlatform: "TO_CONFIRM", incidentProcess: "TO_CONFIRM" },
    artifactAuthorityModel: { states: ["CURRENT_AUTHORITATIVE", "REVIEW_SNAPSHOT", "SUPERSEDED", "REFERENCE_ONLY"], rule: "Artifact authority is separate from review lifecycle state; a review snapshot never silently becomes current authoritative." },
    stateRevision: 0,
    stateUpdatedAt: at,
    stateProjectionContractVersion: PROJECTION_CONTRACT_VERSION,
    lifecycleEvidence: { DISCOVERY: { enteredAt: at, enteredAtRevision: 0 } },
    engagementSetup: setup,
    valueNorthStar: emptyValueNorthStar(),
    jobs: [],
    checkpoints: [],
    counters: { TC: setup.clientObjective === "TO_CONFIRM" ? 1 : 0 },
  };
  // Zero-prompt start: requirements are assessed immediately so the first dominant action is evidence intake.
  state.evidenceReadinessProfile.requirements = assessAllRequirements(state, new Date(at));
  state.discoverySufficiency = assessDiscoverySufficiency(state, new Date(at));
  return state;
}
