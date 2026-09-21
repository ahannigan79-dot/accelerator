/**
 * Eight specialist contracts. Each specialist is a stateless AI worker with a bounded
 * remit, a required context set, and a structured output schema. Specialists recommend;
 * the Control Plane routes; humans decide.
 */

import { z } from "zod/v4";
import type { LifecycleStage } from "../schema";

export const SPECIALIST_IDS = [
  "CONTROL_PLANE",
  "BLUEPRINT",
  "INTEGRATION_READINESS",
  "TECHNICAL_COMPILER",
  "TRANSFORMATION_PLANNER",
  "BUILD_ENGINE",
  "CODE_VALIDATOR",
  "SIMULATION_ENGINE",
] as const;
export type SpecialistId = (typeof SPECIALIST_IDS)[number];

export type ContextSection = "ENGAGEMENT" | "EVIDENCE" | "DISCOVERY" | "BLUEPRINT" | "BASELINE" | "VALUE_NORTH_STAR" | "DECISIONS" | "OPEN_ITEMS" | "INTEGRATION" | "TECHNICAL" | "PLAN" | "BUILD" | "VALIDATION" | "SIMULATION" | "GATES";

export interface SpecialistContract<T extends z.ZodTypeAny = z.ZodTypeAny> {
  id: SpecialistId;
  name: string;
  objective: string;
  stages: LifecycleStage[];
  /** Whether the specialist can be invoked as an AI worker (Control Plane and deterministic engines are not). */
  aiWorker: boolean;
  requiredContext: ContextSection[];
  optionalContext: ContextSection[];
  mustNot: string[];
  outputSchema: T;
  systemPrompt: string;
  /** Kind of recommendation payload produced (drives ACCEPT_RECOMMENDATION). */
  producesKind: "BLUEPRINT" | "INTEGRATION_CONTRACT" | "TECHNICAL_ENRICHMENT" | "TRANSFORMATION_PLAN" | "OPEN_ITEMS" | "EVIDENCE_CLASSIFICATION" | "NONE";
}

const GOVERNANCE = `You are one specialist inside a governed AI delivery factory. Three rules bind every output:
1. You interpret evidence, gaps, relevance and recommendations. You never approve anything.
2. Deterministic controls compute gate outcomes from recorded state and evidence. Nothing you write changes a gate.
3. Authorized humans approve, reject, correct, waive and select paths. Your output is a recommendation they will review.
Work only from the Context Manifest you are given. It is the authoritative context for exactly one engagement. Do not draw on facts about other clients or engagements. Never invent evidence; when something is unknown write TO_CONFIRM and raise it as an open item. Never present synthetic or simulated material as real proof. Keep client facts inside this engagement.`;

const ruleSchema = z.object({ statement: z.string(), ruleType: z.enum(["Business Policy", "Deterministic", "Regulatory", "Human Authority", "Data Quality"]), hardStop: z.boolean(), provenance: z.object({ sourceType: z.string(), sourceRef: z.string(), status: z.enum(["UNCONFIRMED", "CLIENT_CONFIRMED", "SOURCE_SUPPORTED", "VERIFIED", "DISPUTED"]) }) });
const checkSchema = z.object({ name: z.string(), purpose: z.string(), executionPersona: z.string(), executionPoint: z.string(), supportsDecisionStepIds: z.array(z.string()), inputsEvidence: z.string(), sourceSystems: z.string(), logicType: z.enum(["Deterministic", "AI-assisted", "Human judgment", "Hybrid"]), expectedResult: z.string(), passAction: z.string(), failAction: z.string(), output: z.string(), writebackAction: z.string(), authority: z.string(), sourceRefs: z.array(z.string()) });
const actionSchema = z.object({ name: z.string(), actor: z.string(), availableWhen: z.string(), preconditions: z.string(), effect: z.string(), nextState: z.string(), targetStepId: z.string(), systemImpact: z.string(), rerunBehavior: z.string(), auditRequirements: z.string() });
const stepSchema = z.object({
  contractId: z.string().describe("WF-### stable id"),
  phase: z.string(),
  name: z.string(),
  owner: z.string(),
  lane: z.string(),
  type: z.enum(["human", "ai", "system", "mixed"]),
  purpose: z.string(),
  trigger: z.string(),
  inputs: z.array(z.string()),
  aiRole: z.string(),
  humanAuthority: z.string(),
  systems: z.array(z.string()),
  reads: z.array(z.string()),
  writes: z.array(z.string()),
  exceptions: z.string(),
  rerun: z.string(),
  outcome: z.string(),
  writeback: z.string(),
  notes: z.string(),
  evidenceRefs: z.array(z.string()),
  rules: z.array(ruleSchema),
  checks: z.array(checkSchema),
  humanActions: z.array(actionSchema),
});

export const BlueprintOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  phases: z.array(z.object({ key: z.string(), name: z.string(), desc: z.string() })),
  steps: z.array(stepSchema),
  currentAi: z.array(z.object({ category: z.string(), capability: z.string(), currentPosition: z.string(), treatment: z.enum(["KEEP", "REUSE", "EXTEND", "HARDEN", "REFACTOR", "REPLACE", "REDUCE", "BUILD_NEW", "TO_CONFIRM"]), why: z.string(), evidenceStatus: z.enum(["CURRENT_STATE_DOCUMENTED", "CLIENT_STATED", "VERIFIED_IN_RUNTIME", "TO_CONFIRM"]), workflowRefs: z.array(z.string()) })),
  valueNorthStar: z.object({ objective: z.string(), primaryMetric: z.string(), metricDefinition: z.string(), measurementGranularity: z.string(), unit: z.string(), direction: z.enum(["LOWER_IS_BETTER", "HIGHER_IS_BETTER", "TO_CONFIRM"]), startEvent: z.string(), endEvent: z.string(), baseline: z.string(), target: z.string(), owner: z.string(), reportingCadence: z.string(), secondaryMetrics: z.array(z.string()) }),
  openItems: z.array(z.object({ title: z.string(), detail: z.string(), owner: z.string(), relatedIds: z.array(z.string()) })),
  contradictionsNoted: z.array(z.string()),
});

export const IntegrationOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  integrations: z.array(z.object({ integrationId: z.string(), name: z.string(), system: z.string(), businessNeed: z.string(), logicalContract: z.string(), physicalRealization: z.string(), runtimeVerification: z.string(), requirementStatus: z.enum(["REQUIRED", "CONDITIONAL", "TO_CONFIRM", "NOT_REQUIRED"]), readiness: z.enum(["DISCOVERED", "REQUIREMENT_DEFINED", "CLIENT_CONFIRMED"]), modes: z.array(z.enum(["READ", "WRITE", "EVENT", "DOCUMENT", "QUERY", "BATCH", "HUMAN_HANDOFF"])), writeAuthority: z.object({ aiMayPrepare: z.boolean().nullable(), aiMayInitiate: z.boolean().nullable(), executionPermission: z.string(), humanBusinessAuthority: z.string() }).nullable(), mockability: z.enum(["MOCK_ALLOWED_FOR_BUILD", "MOCK_ALLOWED_FOR_NON_PRODUCTION_TEST", "REAL_INTERFACE_REQUIRED_BEFORE_BUILD", "REAL_INTERFACE_REQUIRED_BEFORE_UAT", "REAL_INTERFACE_REQUIRED_BEFORE_RELEASE", "TO_CONFIRM"]), workflowStepIds: z.array(z.string()), owner: z.string() })),
  data: z.array(z.object({ dataId: z.string(), name: z.string(), entity: z.string(), systemOfRecord: z.string(), readAuthority: z.string(), writeAuthority: z.string(), sensitivity: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "PERSONAL", "TO_CONFIRM"]), workflowStepIds: z.array(z.string()), status: z.enum(["DEFINED", "TO_CONFIRM"]) })),
  openItems: z.array(z.object({ title: z.string(), detail: z.string(), owner: z.string(), relatedIds: z.array(z.string()) })),
});

export const TechnicalOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  notes: z.array(z.string()).describe("Architecture reasoning notes to attach to the deterministic technical design"),
  additionalConstraints: z.array(z.string()),
  additionalOpenDecisions: z.array(z.object({ topic: z.string(), detail: z.string(), owner: z.string(), arbRequired: z.boolean() })),
  reuseWarnings: z.array(z.string()).describe("Places where a net-new service would wrongly replace a KEEP/REUSE component"),
});

export const PlannerOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  workPackages: z.array(z.object({ packageId: z.string(), scope: z.string(), deliverable: z.string(), workflowStepIds: z.array(z.string()), activities: z.array(z.object({ name: z.string(), humanHours: z.number(), aiAddressable: z.boolean(), aiProductivityAssumption: z.number().nullable(), assumptionRationale: z.string().nullable(), nonCompressibleFloor: z.enum(["HUMAN_VERIFICATION", "EVALUATION", "PRODUCTION_HARDENING", "GOVERNANCE", "CLIENT_DECISION", "ACCESS_LEAD_TIME", "UAT_WINDOW", "APPROVAL_DWELL"]).nullable() })), humanLedEffortRange: z.object({ low: z.number(), high: z.number() }), humanLedElapsedDays: z.number(), compressibleElements: z.array(z.string()), nonCompressibleCriticalPath: z.array(z.string()), clientDependencies: z.array(z.string()), reuseIncluded: z.array(z.string()), dependsOn: z.array(z.string()), confidence: z.enum(["LOW", "MEDIUM", "HIGH"]), calibrationNote: z.string() })),
  humanAdoptionPlan: z.array(z.string()),
  complianceRiskReadout: z.array(z.string()),
});

export const OpenItemsOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  items: z.array(z.object({ kind: z.enum(["TO_CONFIRM", "BLOCKER", "RISK", "QUESTION"]), title: z.string(), detail: z.string(), owner: z.string(), relatedIds: z.array(z.string()) })),
});

export const EvidenceClassificationOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  classifications: z.array(z.object({ evidenceRef: z.string(), requirementIds: z.array(z.string()), evidenceType: z.string().nullable(), note: z.string() })),
  contradictions: z.array(z.object({ topic: z.string(), evidenceRefs: z.array(z.string()), description: z.string() })),
  nextQuestion: z.string().describe("Exactly one next material question or action for the consultant"),
});

export const SPECIALISTS: Record<SpecialistId, SpecialistContract> = {
  CONTROL_PLANE: {
    id: "CONTROL_PLANE",
    name: "AI Delivery Control Plane",
    objective: "Route work, own lifecycle and gate orchestration, keep AI / deterministic / human authority separated.",
    stages: [],
    aiWorker: false,
    requiredContext: ["ENGAGEMENT", "GATES"],
    optionalContext: [],
    mustNot: ["replace specialist deliverables with improvised general-agent work", "self-approve gates", "trust stale Runtime Context", "silently fix missing evidence", "infer cross-client context", "treat chat history as durable state"],
    outputSchema: z.object({}),
    systemPrompt: "",
    producesKind: "NONE",
  },
  BLUEPRINT: {
    id: "BLUEPRINT",
    name: "AI Delivery Blueprint",
    objective: "Convert client evidence into a governed business-design contract and working Blueprint.",
    stages: ["DISCOVERY", "BASELINE_DESIGN", "TARGET_DESIGN"],
    aiWorker: true,
    requiredContext: ["ENGAGEMENT", "EVIDENCE", "DISCOVERY", "VALUE_NORTH_STAR"],
    optionalContext: ["BLUEPRINT", "BASELINE", "DECISIONS", "OPEN_ITEMS"],
    mustNot: ["confirm any step, check, action or value metric", "invent evidence", "collapse check preparation and downstream decision consumption into one concept"],
    outputSchema: BlueprintOutput,
    producesKind: "BLUEPRINT",
    systemPrompt: `${GOVERNANCE}
You are the Blueprint specialist. Reconstruct the workflow from the evidence supplied. Produce stable step IDs WF-001, WF-002 ... in execution order, grouped into phases. For every step give the AI role, the human authority, systems, reads, writes, exceptions, rerun behaviour and the correlated outcome.
Rules carry provenance: cite the evidenceRef that supports each rule, or mark it UNCONFIRMED. Checks are prepared at one execution step and consumed by later decision steps (supportsDecisionStepIds) — keep these distinct. Human actions are first-class objects with actor, preconditions, effect and next state.
In BASELINE mode describe the current state only. In TARGET mode with AI_NATIVE_REIMAGINED you may restructure, but keep every baseline rule unless evidence says it changed, and mark the treatment of existing capability (KEEP/REUSE/EXTEND/...).
Value North Star: propose the primary measurable outcome from evidence; leave fields TO_CONFIRM when unsupported. Raise every unknown as an open item. Do not claim anything is approved.`,
  },
  INTEGRATION_READINESS: {
    id: "INTEGRATION_READINESS",
    name: "AI Delivery Integration Readiness",
    objective: "Separate business need, logical contract, physical realization and runtime verification for every integration and data object.",
    stages: ["INTEGRATION_DATA_READINESS"],
    aiWorker: true,
    requiredContext: ["ENGAGEMENT", "BLUEPRINT", "EVIDENCE"],
    optionalContext: ["INTEGRATION", "DECISIONS", "OPEN_ITEMS"],
    mustNot: ["skip readiness states by inference", "treat connectivity as authority", "treat mock success as production readiness"],
    outputSchema: IntegrationOutput,
    producesKind: "INTEGRATION_CONTRACT",
    systemPrompt: `${GOVERNANCE}
You are the Integration Readiness specialist. From the approved design, derive every system interaction as an integration contract (INT-###) and every data object as a data contract (DATA-###).
For each integration answer four separate questions: business need, logical contract, physical realization, runtime verification. Set readiness no higher than CLIENT_CONFIRMED and only when a client-authoritative evidence record confirms it; otherwise DISCOVERED or REQUIREMENT_DEFINED. For every WRITE mode fill the write authority with four separate permissions (AI prepare, AI initiate, execution permission, human business authority); use null where unknown. Classify mockability honestly; TO_CONFIRM when unknown.`,
  },
  TECHNICAL_COMPILER: {
    id: "TECHNICAL_COMPILER",
    name: "AI Delivery Technical Compiler",
    objective: "Enrich the deterministic Controlled Technical Design with architecture reasoning, constraints and open decisions.",
    stages: ["TECHNICAL_DESIGN"],
    aiWorker: true,
    requiredContext: ["ENGAGEMENT", "BLUEPRINT", "INTEGRATION"],
    optionalContext: ["TECHNICAL", "EVIDENCE", "DECISIONS"],
    mustNot: ["turn logical capability into a new deployable service by default", "change KEEP/REUSE treatments", "propose a parallel telemetry platform without an explicit decision"],
    outputSchema: TechnicalOutput,
    producesKind: "TECHNICAL_ENRICHMENT",
    systemPrompt: `${GOVERNANCE}
You are the Technical Compiler. The deterministic compiler has already assembled components, agents, reuse/extend/net-new lists and open decisions from the design contract. Your job is enrichment: architecture reasoning notes, additional constraints, additional open decisions, and reuse warnings where a net-new build would wrongly replace a KEEP or REUSE component. Preserve brownfield reuse. Operational telemetry and business value telemetry are separate planes; reuse the client's observability ecosystem by default.`,
  },
  TRANSFORMATION_PLANNER: {
    id: "TRANSFORMATION_PLANNER",
    name: "AI Delivery Transformation Planner",
    objective: "Estimate by delivery work package with human baseline first and activity-specific AI adjustments.",
    stages: ["TRANSFORMATION_PLANNING"],
    aiWorker: true,
    requiredContext: ["ENGAGEMENT", "BLUEPRINT", "TECHNICAL"],
    optionalContext: ["INTEGRATION", "PLAN", "DECISIONS"],
    mustNot: ["apply one percentage to a whole package", "double-count reuse and AI acceleration", "infer price, margin, rates, ROI or payback"],
    outputSchema: PlannerOutput,
    producesKind: "TRANSFORMATION_PLAN",
    systemPrompt: `${GOVERNANCE}
You are the Transformation Planner. Estimate by delivery work package (WP-###), never by use-case count. For each package: activity breakdown with human-led hours first; mark only genuinely AI-addressable activities and give each its own explicit productivity assumption (0..0.95) with a rationale — never one blanket factor. Mark non-compressible floors (human verification, evaluation, production hardening, governance/ARB/security/privacy, client decisions, access lead time, UAT windows, approval dwell) and never compress them. Declare dependencies between packages so the timeline can overlap. Do not produce any economics.`,
  },
  BUILD_ENGINE: {
    id: "BUILD_ENGINE",
    name: "AI Delivery Build Engine",
    objective: "Compile approved technical design into a repository-independent Build Contract for a coding partner.",
    stages: ["BUILD_CONTRACT"],
    aiWorker: false,
    requiredContext: ["BLUEPRINT", "TECHNICAL", "INTEGRATION"],
    optionalContext: ["DECISIONS"],
    mustNot: ["let repository discovery silently change approved intent", "rewrite approved design from CI recommendations"],
    outputSchema: z.object({}),
    systemPrompt: "",
    producesKind: "NONE",
  },
  CODE_VALIDATOR: {
    id: "CODE_VALIDATOR",
    name: "AI Delivery Code Validator",
    objective: "Certify the Build Contract and validate implementation evidence against it.",
    stages: ["IMPLEMENTATION_READINESS", "IMPLEMENTATION_VALIDATION"],
    aiWorker: true,
    requiredContext: ["ENGAGEMENT", "BUILD", "EVIDENCE"],
    optionalContext: ["VALIDATION", "DECISIONS"],
    mustNot: ["let missing repository evidence invalidate an internally valid contract", "let a valid contract imply implementation or deployment", "accept design documents or developer statements as deployment proof"],
    outputSchema: OpenItemsOutput,
    producesKind: "OPEN_ITEMS",
    systemPrompt: `${GOVERNANCE}
You are the Code Validator. The deterministic validator has already scored each build unit from claimed evidence. Review the evidence catalog against the Build Contract and raise open items: missing evidence per unit, evidence that is only a document or statement, unresolved decisions that appear hard-coded, ARB-sensitive changes without review. Never state that something is deployed unless real deployment evidence exists.`,
  },
  SIMULATION_ENGINE: {
    id: "SIMULATION_ENGINE",
    name: "AI Delivery Simulation Engine",
    objective: "Run business and engineering simulations whose every result is SYNTHETIC_SIMULATION.",
    stages: ["TARGET_DESIGN", "EXPERIENCE", "BUILD_CONTRACT", "IMPLEMENTATION_READINESS", "RELEASE_READINESS"],
    aiWorker: false,
    requiredContext: ["BLUEPRINT"],
    optionalContext: ["BUILD"],
    mustNot: ["manufacture real implementation evidence", "grant release approval"],
    outputSchema: z.object({}),
    systemPrompt: "",
    producesKind: "NONE",
  },
};

/** Additional AI task the Blueprint specialist supports at intake: evidence inventory and classification. */
export const EVIDENCE_INTAKE_CONTRACT: SpecialistContract<typeof EvidenceClassificationOutput> = {
  id: "BLUEPRINT",
  name: "AI Delivery Blueprint — evidence intake",
  objective: "Inventory and classify evidence, identify contradictions, and ask exactly one next material question.",
  stages: ["DISCOVERY"],
  aiWorker: true,
  requiredContext: ["ENGAGEMENT", "EVIDENCE"],
  optionalContext: ["DISCOVERY", "OPEN_ITEMS"],
  mustNot: ["mark any requirement satisfied", "invent evidence"],
  outputSchema: EvidenceClassificationOutput,
  producesKind: "EVIDENCE_CLASSIFICATION",
  systemPrompt: `${GOVERNANCE}
You are the Blueprint specialist performing evidence intake. For each evidence record decide which evidence requirements (EVID-###) it is relevant to and whether its evidence type looks mis-classified. Point out contradictions between records. Summarize what is known and unknown. Finish with exactly one next material question or action for the consultant. You do not decide whether any requirement is satisfied — the deterministic evidence engine does.`,
};
