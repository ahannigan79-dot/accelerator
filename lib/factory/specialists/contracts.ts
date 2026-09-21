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

export type ContextSection = "ENGAGEMENT" | "ENTERPRISE" | "EVIDENCE" | "DISCOVERY" | "BLUEPRINT" | "BASELINE" | "VALUE_NORTH_STAR" | "DECISIONS" | "OPEN_ITEMS" | "INTEGRATION" | "TECHNICAL" | "PLAN" | "BUILD" | "VALIDATION" | "SIMULATION" | "GATES";

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
  producesKind: "BLUEPRINT" | "BLUEPRINT_ENRICHMENT" | "CITATION_VERDICTS" | "ENTERPRISE_CONTEXT" | "INTEGRATION_CONTRACT" | "TECHNICAL_ENRICHMENT" | "TRANSFORMATION_PLAN" | "OPEN_ITEMS" | "EVIDENCE_CLASSIFICATION" | "NONE";
}

const GOVERNANCE = `You are one specialist inside a governed AI delivery factory. Three rules bind every output:
1. You interpret evidence, gaps, relevance and recommendations. You never approve anything.
2. Deterministic controls compute gate outcomes from recorded state and evidence. Nothing you write changes a gate.
3. Authorized humans approve, reject, correct, waive and select paths. Your output is a recommendation they will review.
Work only from the Context Manifest you are given. It is the authoritative context for exactly one engagement. Do not draw on facts about other clients or engagements. Never invent evidence; when something is unknown write TO_CONFIRM and raise it as an open item. Never present synthetic or simulated material as real proof. Keep client facts inside this engagement.
Be economical: this output is a working draft that humans will refine. Keep every free-text field to one or two sentences, do not repeat evidence verbatim, and prefer fewer well-founded items over exhaustive lists.`;

const basisSchema = z.enum(["DOCUMENTED", "OBSERVED", "INFERRED"]).describe("DOCUMENTED: written in a policy, SOP or system configuration. OBSERVED: seen in data, emails or interviews but not written as a rule. INFERRED: your reasoning; no evidence states it.");
const ruleSchema = z.object({ statement: z.string(), ruleType: z.enum(["Business Policy", "Deterministic", "Regulatory", "Human Authority", "Data Quality"]), hardStop: z.boolean(), basis: basisSchema, provenance: z.object({ sourceType: z.string(), sourceRef: z.string().describe("The evidenceRef (EV-###) that states or shows this rule, or empty"), status: z.enum(["UNCONFIRMED", "CLIENT_CONFIRMED", "SOURCE_SUPPORTED", "VERIFIED", "DISPUTED"]) }) });
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
  basis: basisSchema,
  evidenceRefs: z.array(z.string()),
  rules: z.array(ruleSchema),
  checks: z.array(checkSchema),
  humanActions: z.array(actionSchema),
  noHumanDecision: z.boolean().describe("true only when a person owns the step (type human or mixed) and genuinely nobody decides anything there"),
  noHumanDecisionReason: z.string(),
});

/** Structure-only step: the skeleton a human confirms before any rules, checks or actions are drafted. */
const structureStepSchema = z.object({
  contractId: z.string().describe("WF-### stable id"),
  phase: z.string(),
  name: z.string(),
  owner: z.string(),
  lane: z.string().describe("Swimlane: the site, team or channel where the step runs. A site or channel outside the main system of record gets its own lane."),
  type: z.enum(["human", "ai", "system", "mixed"]),
  purpose: z.string(),
  trigger: z.string(),
  inputs: z.array(z.string()),
  systems: z.array(z.string()),
  outcome: z.string(),
  basis: basisSchema,
  evidenceRefs: z.array(z.string()),
});

const ENTERPRISE_GUIDANCE = `Enterprise context: when the manifest carries a confirmed ENTERPRISE section, it is the ground truth for systems of record, integration patterns, data ownership and constraints. Name systems exactly as it does, place each step's systems within that landscape, and never introduce a system, interface or data owner it does not know without raising an open item.`;
const LANE_GUIDANCE = `Parallel lanes: when the evidence shows work happening at a site, plant, channel or system outside the main system of record (a second location on a different ledger, an email or spreadsheet side-channel, a manual register), model it as its own lane with its own steps. Never reduce it to a note on the main lane. Set lane to that site or channel and say how and where the two lanes rejoin.`;
const BASIS_GUIDANCE = `Basis: every step and rule carries a basis. DOCUMENTED only when a policy, SOP or system configuration in the evidence states it; OBSERVED when transaction data, emails or interviews show it happening but nothing writes it down; INFERRED when it is your reasoning. Do not file an observation as a policy rule: an OBSERVED pattern is a rule only if the client treats deviation as an exception.`;
const HUMAN_DECISION_GUIDANCE = `Human decisions: every step of type human or mixed must carry at least one human action (who decides what, with which effect and next state), or set noHumanDecision to true with a one-sentence reason. A step owned by a person with no decision and no reason is incomplete.`;

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
  referenceArchitecture: z.object({ status: z.enum(["CURRENT_STATE_DOCUMENTED", "CLIENT_STATED", "TO_CONFIRM"]), note: z.string(), patterns: z.array(z.string()) }).describe("Current-state system landscape as evidenced: systems, integrations, notable absences"),
});

const currentAiSchema = BlueprintOutput.shape.currentAi;
const valueNorthStarSchema = BlueprintOutput.shape.valueNorthStar;
const openItemsSchema = BlueprintOutput.shape.openItems;
const referenceArchitectureSchema = BlueprintOutput.shape.referenceArchitecture;

/** Task STRUCTURE: phases and steps only. Humans confirm the skeleton before anything is hung on it. */
export const BlueprintStructureOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  phases: z.array(z.object({ key: z.string(), name: z.string(), desc: z.string() })),
  steps: z.array(structureStepSchema),
  currentAi: currentAiSchema,
  valueNorthStar: valueNorthStarSchema,
  openItems: openItemsSchema,
  contradictionsNoted: z.array(z.string()),
  referenceArchitecture: referenceArchitectureSchema,
});

/** Task ENRICH: rules, checks and human actions for confirmed steps only. */
export const BlueprintEnrichmentOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  steps: z.array(z.object({
    contractId: z.string().describe("Must be one of the confirmed step ids listed in the task"),
    rules: z.array(ruleSchema),
    checks: z.array(checkSchema),
    humanActions: z.array(actionSchema),
    noHumanDecision: z.boolean(),
    noHumanDecisionReason: z.string(),
  })),
  openItems: openItemsSchema,
});

/** Task CITATION_CHECK: does the cited evidence record actually say what the rule claims? */
export const CitationCheckOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  verdicts: z.array(z.object({
    ruleId: z.string(),
    sourceRef: z.string(),
    verdict: z.enum(["SUPPORTED", "PARTIAL", "NOT_SUPPORTED", "SOURCE_MISSING"]).describe("SUPPORTED: the record states or clearly shows the rule. PARTIAL: it supports part of the statement or a weaker version. NOT_SUPPORTED: the record does not say this, or says something different. SOURCE_MISSING: the cited record is not in the manifest."),
    quote: z.string().describe("Shortest verbatim excerpt from the cited record that decides the verdict; empty when nothing relevant exists"),
    note: z.string(),
  })),
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
    optionalContext: ["ENTERPRISE", "BLUEPRINT", "BASELINE", "DECISIONS", "OPEN_ITEMS"],
    mustNot: ["confirm any step, check, action or value metric", "invent evidence", "name a system, integration or data owner that contradicts the confirmed enterprise context", "collapse check preparation and downstream decision consumption into one concept"],
    outputSchema: BlueprintOutput,
    producesKind: "BLUEPRINT",
    systemPrompt: `${GOVERNANCE}
You are the Blueprint specialist. Reconstruct the workflow from the evidence supplied. Produce stable step IDs WF-001, WF-002 ... in execution order, grouped into phases. For every step give the AI role, the human authority, systems, reads, writes, exceptions, rerun behaviour and the correlated outcome.
Rules carry provenance: cite the evidenceRef that supports each rule, or mark it UNCONFIRMED. Checks are prepared at one execution step and consumed by later decision steps (supportsDecisionStepIds) — keep these distinct. Human actions are first-class objects with actor, preconditions, effect and next state.
In BASELINE mode describe the current state only. In TARGET mode with AI_NATIVE_REIMAGINED you may restructure, but keep every baseline rule unless evidence says it changed, and mark the treatment of existing capability (KEEP/REUSE/EXTEND/...).
${ENTERPRISE_GUIDANCE}
${LANE_GUIDANCE}
${BASIS_GUIDANCE}
${HUMAN_DECISION_GUIDANCE}
Value North Star: propose the primary measurable outcome from evidence; leave fields TO_CONFIRM when unsupported. Raise every unknown as an open item. Do not claim anything is approved.
Size: aim for 6 to 12 steps, at most 3 rules, 2 checks and 2 human actions per step, and at most 8 open items. The whole response should stay under roughly 12,000 tokens.`,
  },
  INTEGRATION_READINESS: {
    id: "INTEGRATION_READINESS",
    name: "AI Delivery Integration Readiness",
    objective: "Separate business need, logical contract, physical realization and runtime verification for every integration and data object.",
    stages: ["INTEGRATION_DATA_READINESS"],
    aiWorker: true,
    requiredContext: ["ENGAGEMENT", "BLUEPRINT", "EVIDENCE"],
    optionalContext: ["ENTERPRISE", "INTEGRATION", "DECISIONS", "OPEN_ITEMS"],
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
    optionalContext: ["ENTERPRISE", "TECHNICAL", "EVIDENCE", "DECISIONS"],
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

/** Task STRUCTURE: the Blueprint specialist drafts phases and steps only. Rules, checks and actions come later, per confirmed step. */
export const BLUEPRINT_STRUCTURE_CONTRACT: SpecialistContract<typeof BlueprintStructureOutput> = {
  id: "BLUEPRINT",
  name: "AI Delivery Blueprint — workflow structure",
  objective: "Reconstruct the workflow skeleton (phases, lanes, steps) from evidence for human confirmation before any detail is added.",
  stages: ["DISCOVERY", "BASELINE_DESIGN", "TARGET_DESIGN"],
  aiWorker: true,
  requiredContext: ["ENGAGEMENT", "EVIDENCE", "DISCOVERY", "VALUE_NORTH_STAR"],
  optionalContext: ["ENTERPRISE", "BLUEPRINT", "BASELINE", "DECISIONS", "OPEN_ITEMS"],
  mustNot: ["confirm any step or value metric", "invent evidence", "name a system, integration or data owner that contradicts the confirmed enterprise context", "draft rules, checks or human actions (those are a later task on confirmed steps)"],
  outputSchema: BlueprintStructureOutput,
  producesKind: "BLUEPRINT",
  systemPrompt: `${GOVERNANCE}
You are the Blueprint specialist drafting the workflow structure only. Produce phases and steps with stable ids WF-001, WF-002 ... in execution order. For each step give owner, lane, type, purpose, trigger, inputs, systems, outcome, basis and the evidence it rests on. Do not draft rules, checks or human actions: humans confirm this skeleton first, and detail is added per confirmed step in a later task.
${ENTERPRISE_GUIDANCE}
${LANE_GUIDANCE}
${BASIS_GUIDANCE}
In BASELINE mode describe the current state only: what happens today, in the order it happens, including workarounds and side-channels. In TARGET mode you may restructure, but keep every baseline step unless evidence or a recorded decision says it changed.
Value North Star: propose the primary measurable outcome from evidence; leave fields TO_CONFIRM when unsupported. Inventory current AI or automation capability as seen in evidence. Raise every unknown as an open item and list contradictions you notice.
Size: aim for 6 to 14 steps and at most 8 open items. Keep the response under roughly 6,000 tokens.`,
};

/** Task ENRICH: rules, checks and human actions for the steps a human has confirmed. */
export const BLUEPRINT_ENRICH_CONTRACT: SpecialistContract<typeof BlueprintEnrichmentOutput> = {
  id: "BLUEPRINT",
  name: "AI Delivery Blueprint — step enrichment",
  objective: "Draft rules, checks and human actions for confirmed workflow steps, each with basis and evidence provenance.",
  stages: ["BASELINE_DESIGN", "TARGET_DESIGN"],
  aiWorker: true,
  requiredContext: ["ENGAGEMENT", "EVIDENCE", "BLUEPRINT"],
  optionalContext: ["ENTERPRISE", "BASELINE", "DECISIONS", "OPEN_ITEMS", "VALUE_NORTH_STAR"],
  mustNot: ["add, rename, reorder or remove steps", "enrich a step that is not in the confirmed list", "confirm anything", "collapse check preparation and downstream decision consumption into one concept"],
  outputSchema: BlueprintEnrichmentOutput,
  producesKind: "BLUEPRINT_ENRICHMENT",
  systemPrompt: `${GOVERNANCE}
You are the Blueprint specialist enriching confirmed workflow steps. The task lists the step ids a human has confirmed; return exactly those and nothing else. For each: rules (business policy, deterministic, regulatory, human authority, data quality), checks prepared at this step and consumed by later decision steps (supportsDecisionStepIds must name other steps), and human actions.
Rules carry provenance: sourceRef is the evidenceRef that states or shows the rule, or empty with status UNCONFIRMED. Never cite a record that does not say it. Where two records disagree, mark the rule DISPUTED and say which records.
${BASIS_GUIDANCE}
${HUMAN_DECISION_GUIDANCE}
Size: at most 3 rules, 2 checks and 2 human actions per step. Keep the response under roughly 8,000 tokens.`,
};

/** Task CITATION_CHECK: verify each rule's cited evidence actually supports it. */
export const CITATION_CHECK_CONTRACT: SpecialistContract<typeof CitationCheckOutput> = {
  id: "BLUEPRINT",
  name: "AI Delivery Blueprint — citation check",
  objective: "For every rule that cites an evidence record, decide whether that record supports the rule as stated.",
  stages: ["BASELINE_DESIGN", "TARGET_DESIGN", "BASELINE_APPROVAL", "TARGET_DESIGN_APPROVAL"],
  aiWorker: true,
  requiredContext: ["ENGAGEMENT", "EVIDENCE", "BLUEPRINT"],
  optionalContext: ["DECISIONS"],
  mustNot: ["rewrite rules", "consult evidence other than the cited record when judging a citation", "treat your own reasoning as support"],
  outputSchema: CitationCheckOutput,
  producesKind: "CITATION_VERDICTS",
  systemPrompt: `${GOVERNANCE}
You are the Blueprint specialist checking citations. The task lists rules and the evidence record each one cites. For each rule read only the cited record's content and decide: SUPPORTED when the record states or clearly shows the rule as written; PARTIAL when it supports a weaker or narrower version (say what differs); NOT_SUPPORTED when the record does not say it or says something different; SOURCE_MISSING when the record is not in the manifest. Quote the shortest verbatim excerpt that decides the verdict. A rule that other records support but the cited one does not is still NOT_SUPPORTED for this citation; mention the better record in the note. Return one verdict per listed rule.`,
};

const enterpriseEntrySchema = z.object({
  name: z.string(),
  detail: z.string(),
  qualifier: z.string().describe("Standards: scope. Systems: role and hosting. Integration patterns: platform or mechanism. Data domains: system of record. Security and AI policy: source document"),
  owner: z.string(),
  sensitivity: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "PERSONAL", "TO_CONFIRM"]).nullable().describe("Data domains only"),
  evidenceRefs: z.array(z.string()),
  status: z.enum(["DOCUMENTED", "CLIENT_STATED", "TO_CONFIRM"]).describe("DOCUMENTED only when a cited evidence record states it"),
});

export const EnterpriseContextOutput = z.object({
  summary: z.string(),
  rationale: z.string(),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  enterpriseContext: z.object({
    summary: z.string().describe("Two or three sentences on the client's landscape as evidenced"),
    architectureStandards: z.array(enterpriseEntrySchema),
    systems: z.array(enterpriseEntrySchema).describe("Systems of record and tools actually in use, including spreadsheets, email and manual registers"),
    integrationPatterns: z.array(enterpriseEntrySchema).describe("How systems talk to each other today, including the absence of interfaces"),
    dataDomains: z.array(enterpriseEntrySchema).describe("Business data domains with their system of record and owner"),
    securityCompliance: z.array(enterpriseEntrySchema),
    aiPolicy: z.array(enterpriseEntrySchema).describe("Client rules about AI or automation use; empty when nothing is evidenced"),
    gaps: z.array(z.string()).describe("What the evidence does not tell us about the landscape"),
  }),
  openItems: z.array(z.object({ title: z.string(), detail: z.string(), owner: z.string(), relatedIds: z.array(z.string()) })),
});

/** Task ENTERPRISE_CONTEXT: ground the client landscape before any workflow is designed on it. */
export const ENTERPRISE_CONTEXT_CONTRACT: SpecialistContract<typeof EnterpriseContextOutput> = {
  id: "BLUEPRINT",
  name: "AI Delivery Blueprint — enterprise context",
  objective: "Draft the client's enterprise context (architecture standards, systems, integration patterns, data domains, security and compliance constraints, AI policy) from evidence, for client architect confirmation.",
  stages: ["DISCOVERY", "BASELINE_DESIGN"],
  aiWorker: true,
  requiredContext: ["ENGAGEMENT", "EVIDENCE"],
  optionalContext: ["ENTERPRISE", "DISCOVERY", "OPEN_ITEMS", "DECISIONS"],
  mustNot: ["confirm anything", "invent systems, standards or owners", "mark an entry DOCUMENTED without citing the record that documents it", "design workflow steps"],
  outputSchema: EnterpriseContextOutput,
  producesKind: "ENTERPRISE_CONTEXT",
  systemPrompt: `${GOVERNANCE}
You are the Blueprint specialist grounding the enterprise context. Before any workflow is designed, establish what the client actually runs on: architecture standards and principles, the systems in use (including the informal ones: spreadsheets, email, paper registers, side ledgers at other sites), how those systems are and are not integrated, the business data domains with their system of record and owner, security and compliance constraints, and any policy on AI or automation use.
Every entry cites the evidence that shows it. DOCUMENTED means a cited record states it; CLIENT_STATED means someone said it in an interview or email; TO_CONFIRM means you inferred it. List the gaps honestly: what a consultant must still ask the client architect. If an existing enterprise context is in the manifest, refine it rather than restart it, keeping entry names stable.
Size: at most 12 entries per section and 10 gaps. Keep the response under roughly 6,000 tokens.`,
};
