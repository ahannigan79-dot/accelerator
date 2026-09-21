/**
 * Synthetic demo engagement. Everything here is fictional and brand-neutral.
 * The seed drives the engagement through the Governed Action API so every artifact,
 * decision and gate outcome carries real lineage rather than hand-written state.
 */

import { applyAction, type ActionRequest } from "./actions";
import type { Blueprint, WorkflowStep, WorkflowStepInput } from "./blueprint";
import { CONTENT_KEYS } from "./content";
import { projectRuntime } from "./projection";
import type { Actor, FactoryState, LifecycleStage } from "./schema";
import { createEngagementState } from "./state";
import type { IntegrationDataContract } from "./integration";
import type { TransformationPlan } from "./planner";
import type { EngagementRecord } from "./store";

export const DEMO_ENGAGEMENT_ID = "ENG-DEMO-FIELD-SERVICE";

export const ACTORS = {
  consultant: { userId: "c.rivera", role: "CONSULTANT", displayName: "C. Rivera (consultant)" } as Actor,
  lead: { userId: "d.okafor", role: "DELIVERY_LEAD", displayName: "D. Okafor (delivery lead)" } as Actor,
  owner: { userId: "m.chen", role: "CLIENT_BUSINESS_OWNER", displayName: "M. Chen (Director, Maintenance Operations)" } as Actor,
  processOwner: { userId: "s.patel", role: "CLIENT_PROCESS_OWNER", displayName: "S. Patel (Planning lead)" } as Actor,
  architect: { userId: "l.novak", role: "CLIENT_ARCHITECT", displayName: "L. Novak (Enterprise architect)" } as Actor,
  itOps: { userId: "r.haddad", role: "CLIENT_IT_OPERATIONS", displayName: "R. Haddad (IT operations)" } as Actor,
  security: { userId: "a.bello", role: "SECURITY_PRIVACY", displayName: "A. Bello (Security & privacy)" } as Actor,
  arb: { userId: "arb.chair", role: "ARB", displayName: "ARB chair" } as Actor,
};

const step = (p: WorkflowStepInput & Pick<WorkflowStep, "contractId" | "name" | "phase" | "owner" | "lane" | "type" | "purpose">): WorkflowStepInput => ({
  trigger: "",
  inputs: [],
  aiRole: "",
  humanAuthority: "",
  systems: [],
  reads: [],
  writes: [],
  exceptions: "",
  rerun: "",
  outcome: "",
  writeback: "",
  notes: "",
  rules: [],
  checks: [],
  humanActions: [],
  ...p,
});

export function demoBlueprint(workflowId: string): Omit<Partial<Blueprint>, "steps"> & { steps: WorkflowStepInput[] } {
  return {
    workflowId,
    version: "0.1.0",
    mode: "BASELINE",
    phases: [
      { key: "intake", name: "Intake", desc: "Capture and complete the maintenance request." },
      { key: "plan", name: "Plan", desc: "Turn a complete request into an executable plan and estimate." },
      { key: "approve", name: "Approve", desc: "Apply engineering and financial controls." },
      { key: "schedule", name: "Schedule", desc: "Make the approved work order ready for scheduling." },
    ],
    steps: [
      step({
        contractId: "WF-001",
        phase: "intake",
        name: "Request received",
        owner: "Requester / Field technician",
        lane: "field",
        type: "mixed",
        purpose: "Capture a maintenance request with asset, symptom and urgency so it can be planned without rework.",
        trigger: "Technician or operator raises a request in the field mobility app",
        inputs: ["Asset identifier", "Symptom description", "Urgency", "Photos"],
        aiRole: "Check completeness against the asset registry, classify urgency, and prepare a completeness summary.",
        humanAuthority: "Requester confirms the request; AI never rejects a request.",
        systems: ["Field Mobility App", "Asset Registry (ERP-PM)"],
        reads: ["Asset master", "Open work orders for the asset"],
        writes: ["Request record"],
        exceptions: "Unknown asset routes to the planner for identification.",
        rerun: "Re-check completeness only for changed fields.",
        outcome: "COMPLETE or INCOMPLETE request",
        writeback: "Request status written to the request record only.",
        evidenceRefs: ["EV-001", "EV-003"],
        rules: [
          { statement: "Every request must reference a registered asset before planning.", ruleType: "Data Quality", hardStop: true, provenance: { sourceType: "PROCESS_DOCUMENT", sourceRef: "EV-001", status: "SOURCE_SUPPORTED" } },
          { statement: "Emergency priority 1 requests bypass planning and go straight to dispatch.", ruleType: "Business Policy", hardStop: false, provenance: { sourceType: "PROCESS_DOCUMENT", sourceRef: "EV-001", status: "SOURCE_SUPPORTED" } },
        ],
        checks: [
          { name: "Asset match", purpose: "Confirm the asset exists and is active.", execution: { stepId: "WF-001", persona: "AI / Automation", point: "On submit" }, supportsDecisionStepIds: ["WF-002"], inputsEvidence: "Asset identifier, asset master", sourceSystems: "Asset Registry (ERP-PM)", logicType: "Deterministic", expectedResult: "Exactly one active asset matched", passAction: "Request marked COMPLETE for planning", failAction: "Route to planner with 'asset unknown'", output: "Asset match result", writebackAction: "None", authority: "System evaluates; planner resolves failures", sourceRefs: ["EV-001"] },
        ],
        humanActions: [{ name: "Confirm request", actor: "Requester", availableWhen: "Completeness summary shown", preconditions: "Asset matched", effect: "Request enters planning", nextState: "COMPLETE", targetStepId: "WF-002", systemImpact: "Request record status", rerunBehavior: "Re-confirm only when fields change", auditRequirements: "Actor, timestamp, completeness snapshot" }],
      }),
      step({
        contractId: "WF-002",
        phase: "plan",
        name: "Planning proposal",
        owner: "Maintenance Planner",
        lane: "planning",
        type: "mixed",
        purpose: "Produce a task plan, parts list and cost estimate from the complete request.",
        trigger: "Request COMPLETE",
        inputs: ["Complete request", "Asset history", "Parts catalogue", "Labour rates"],
        aiRole: "Draft task plan, parts and estimate from governed sources; flag non-routine work.",
        humanAuthority: "Planner accepts, edits or rejects the draft. AI never finalizes the plan.",
        systems: ["Planning Workbench", "Asset Registry (ERP-PM)", "Parts Catalogue"],
        reads: ["Asset history", "Parts and labour reference data"],
        writes: ["Draft plan"],
        exceptions: "Non-routine work (no matching task library entry) requires engineering review.",
        rerun: "Regenerate only the affected plan sections when request fields change.",
        outcome: "Accepted plan with estimate",
        writeback: "Draft plan stored in the workbench; no ERP write until approval.",
        evidenceRefs: ["EV-001", "EV-002"],
        rules: [
          { statement: "Estimates use the current approved labour and parts rates.", ruleType: "Deterministic", hardStop: true, provenance: { sourceType: "POLICY_DOCUMENT", sourceRef: "EV-002", status: "SOURCE_SUPPORTED" } },
          { statement: "Non-routine work is classified when no task-library template matches.", ruleType: "Business Policy", hardStop: false, provenance: { sourceType: "INTERVIEW_NOTES", sourceRef: "EV-003", status: "CLIENT_CONFIRMED" } },
        ],
        checks: [
          { name: "Estimate threshold classification", purpose: "Classify the estimate against the financial approval threshold.", execution: { stepId: "WF-002", persona: "AI / Automation", point: "On plan acceptance" }, supportsDecisionStepIds: ["WF-004"], inputsEvidence: "Accepted estimate, approval policy", sourceSystems: "Planning Workbench", logicType: "Deterministic", expectedResult: "Estimate classified BELOW or ABOVE threshold", passAction: "Classification recorded for the approval step", failAction: "Plan returned to planner if estimate incomplete", output: "Threshold classification", writebackAction: "None", authority: "System evaluates; approval decision is human", sourceRefs: ["EV-002"] },
          { name: "Non-routine flag", purpose: "Determine whether engineering review is needed.", execution: { stepId: "WF-002", persona: "AI / Automation", point: "On plan draft" }, supportsDecisionStepIds: ["WF-003"], inputsEvidence: "Task plan vs task library", sourceSystems: "Planning Workbench", logicType: "AI-assisted", expectedResult: "ROUTINE or NON_ROUTINE", passAction: "Routine work skips engineering review", failAction: "Flag NON_ROUTINE for engineering", output: "Non-routine flag", writebackAction: "None", authority: "AI recommends; planner may override with reason", sourceRefs: ["EV-003"] },
        ],
        humanActions: [{ name: "Accept plan", actor: "Maintenance Planner", availableWhen: "Draft plan available", preconditions: "Estimate present", effect: "Plan becomes the accepted plan", nextState: "PLAN_ACCEPTED", targetStepId: "WF-003", systemImpact: "Plan record", rerunBehavior: "Re-accept after material edits", auditRequirements: "Actor, timestamp, diff from AI draft" }],
      }),
      step({
        contractId: "WF-003",
        phase: "approve",
        name: "Engineering review",
        owner: "Engineering",
        lane: "engineering",
        type: "human",
        purpose: "Review non-routine work against corporate engineering criteria.",
        trigger: "Plan accepted and flagged NON_ROUTINE",
        inputs: ["Accepted plan", "Non-routine flag", "Engineering criteria"],
        aiRole: "Assemble the review pack and highlight criteria at risk.",
        humanAuthority: "Engineer approves or returns the plan. Required for all non-routine work.",
        systems: ["Planning Workbench"],
        reads: ["Accepted plan"],
        writes: ["Engineering decision"],
        exceptions: "Returned plans go back to the planner with reasons.",
        rerun: "Re-review only when the plan changes after approval.",
        outcome: "ENGINEERING_APPROVED or RETURNED",
        writeback: "Decision stored on the plan record.",
        evidenceRefs: ["EV-001"],
        rules: [{ statement: "Non-routine work must have engineering approval before financial approval.", ruleType: "Human Authority", hardStop: true, provenance: { sourceType: "PROCESS_DOCUMENT", sourceRef: "EV-001", status: "SOURCE_SUPPORTED" } }],
        checks: [],
        humanActions: [
          { name: "Approve engineering", actor: "Engineer", availableWhen: "Review pack available", preconditions: "Plan flagged NON_ROUTINE", effect: "Plan cleared for financial approval", nextState: "ENGINEERING_APPROVED", targetStepId: "WF-004", systemImpact: "Plan record", rerunBehavior: "Re-approve on plan change", auditRequirements: "Actor, timestamp, criteria checklist" },
          { name: "Return plan", actor: "Engineer", availableWhen: "Review pack available", preconditions: "", effect: "Plan returned with reasons", nextState: "RETURNED", targetStepId: "WF-002", systemImpact: "Plan record", rerunBehavior: "Planner revises then resubmits", auditRequirements: "Actor, timestamp, reasons" },
        ],
      }),
      step({
        contractId: "WF-004",
        phase: "approve",
        name: "Financial approval",
        owner: "Operations Manager",
        lane: "operations",
        type: "mixed",
        purpose: "Approve work orders above the financial threshold; auto-route routine work below it.",
        trigger: "Plan accepted (and engineering approved where required)",
        inputs: ["Accepted plan", "Threshold classification", "Engineering decision"],
        aiRole: "Route by threshold classification and prepare the approval summary.",
        humanAuthority: "Operations Manager approves anything ABOVE threshold. AI cannot approve.",
        systems: ["Planning Workbench", "Asset Registry (ERP-PM)"],
        reads: ["Accepted plan", "Threshold classification"],
        writes: ["Approval decision", "Work order (on approval)"],
        exceptions: "Rejected work orders return to the planner.",
        rerun: "Re-approval required if the estimate changes after approval.",
        outcome: "APPROVED or REJECTED work order",
        writeback: "Approved work order created in ERP-PM by the system on human approval.",
        evidenceRefs: ["EV-002", "EV-004"],
        rules: [
          { statement: "Work orders estimated above the approval threshold require Operations Manager approval.", ruleType: "Business Policy", hardStop: true, provenance: { sourceType: "POLICY_DOCUMENT", sourceRef: "EV-002", status: "SOURCE_SUPPORTED" } },
          { statement: "Work orders below the threshold are auto-approved when engineering criteria are met.", ruleType: "Business Policy", hardStop: false, provenance: { sourceType: "POLICY_DOCUMENT", sourceRef: "EV-002", status: "SOURCE_SUPPORTED" } },
        ],
        checks: [{ name: "Approval prerequisites", purpose: "Confirm engineering approval exists where required.", execution: { stepId: "WF-004", persona: "System / platform", point: "Before approval" }, supportsDecisionStepIds: ["WF-005"], inputsEvidence: "Engineering decision, non-routine flag", sourceSystems: "Planning Workbench", logicType: "Deterministic", expectedResult: "Prerequisites satisfied", passAction: "Approval enabled", failAction: "Approval blocked with reason", output: "Prerequisite result", writebackAction: "None", authority: "System evaluates", sourceRefs: ["EV-001"] }],
        humanActions: [{ name: "Approve work order", actor: "Operations Manager", availableWhen: "Estimate ABOVE threshold", preconditions: "Prerequisites satisfied", effect: "Work order created in ERP-PM", nextState: "APPROVED", targetStepId: "WF-005", systemImpact: "ERP-PM work order create", rerunBehavior: "Re-approve on estimate change", auditRequirements: "Actor, timestamp, estimate, threshold" }],
      }),
      step({
        contractId: "WF-005",
        phase: "schedule",
        name: "Ready for schedule",
        owner: "Scheduler",
        lane: "operations",
        type: "system",
        purpose: "Confirm the approved work order has parts, permits and crew availability and mark it ready for scheduling.",
        trigger: "Work order APPROVED",
        inputs: ["Approved work order", "Parts availability", "Permit status"],
        aiRole: "Check readiness and propose a schedule window.",
        humanAuthority: "Scheduler confirms the window.",
        systems: ["Asset Registry (ERP-PM)", "Field Mobility App"],
        reads: ["Work order", "Parts stock"],
        writes: ["Work order status READY"],
        exceptions: "Missing parts hold the work order in WAITING_PARTS.",
        rerun: "Re-check readiness when parts or permits change.",
        outcome: "READY_FOR_SCHEDULE",
        writeback: "Status update written to ERP-PM.",
        evidenceRefs: ["EV-001"],
        rules: [{ statement: "A work order cannot be READY without all critical parts allocated.", ruleType: "Deterministic", hardStop: true, provenance: { sourceType: "TO_VALIDATE", sourceRef: "", status: "UNCONFIRMED" } }],
        checks: [],
        humanActions: [{ name: "Confirm schedule window", actor: "Scheduler", availableWhen: "Readiness checks passed", preconditions: "Parts allocated", effect: "Work order scheduled", nextState: "SCHEDULED", targetStepId: "WF-005", systemImpact: "ERP-PM status", rerunBehavior: "Reschedule allowed", auditRequirements: "Actor, timestamp, window" }],
      }),
    ],
    currentAi: [
      { id: "AI-001", category: "Workflow automation", capability: "Request routing rules engine", currentPosition: "A rules engine in the planning workbench routes requests by priority. No LLM reasoning in place.", treatment: "REUSE", why: "Durable routing that already encodes the priority policy; add the completeness assistant above it.", evidenceStatus: "CURRENT_STATE_DOCUMENTED", reviewStatus: "open", workflowRefs: ["WF-001", "WF-004"] },
      { id: "AI-002", category: "Document automation", capability: "Estimate template generator", currentPosition: "Template-driven estimate document produced from planner inputs.", treatment: "EXTEND", why: "Keep the document output; feed it from the AI-drafted plan.", evidenceStatus: "CLIENT_STATED", reviewStatus: "open", workflowRefs: ["WF-002"] },
    ],
    referenceArchitecture: { status: "CURRENT_STATE_DOCUMENTED", note: "Planning workbench (web) + ERP-PM as system of record + field mobility app. Workbench rules engine documented; no agentic reasoning evidenced.", patterns: ["Web planning workbench with rules engine", "ERP-PM work-order lifecycle as system of record", "Mobile request capture", "Nightly parts stock sync"] },
  };
}

export const DEMO_EVIDENCE = [
  { title: "Maintenance request-to-schedule procedure (PM-OPS-17 Rev 5)", evidenceType: "PROCESS_DOCUMENT", sourceClass: "CLIENT_AUTHORITATIVE", scope: "WORKFLOW", requirementIds: ["EVID-001"], claims: [{ key: "procedure_revision", value: "Rev5" }, { key: "approval_threshold", value: "15000" }], summary: "Corporate procedure covering intake, planning, engineering review, approval and scheduling." },
  { title: "Financial approval policy — work order thresholds", evidenceType: "POLICY_DOCUMENT", sourceClass: "CLIENT_AUTHORITATIVE", scope: "WORKFLOW", requirementIds: ["EVID-001", "EVID-002"], claims: [{ key: "approval_threshold", value: "15000" }], summary: "Work orders above 15,000 require Operations Manager approval." },
  { title: "Planning lead interview notes", evidenceType: "INTERVIEW_NOTES", sourceClass: "CLIENT_INFORMAL", scope: "WORKFLOW", requirementIds: ["EVID-001"], claims: [{ key: "approval_threshold", value: "10000" }], summary: "Planning lead recalls a 10,000 threshold and describes non-routine classification practice." },
  { title: "Site exception memo — temporary broader engineering review", evidenceType: "CLIENT_CONFIRMATION", sourceClass: "CLIENT_AUTHORITATIVE", scope: "WORKFLOW", requirementIds: ["EVID-002"], claims: [{ key: "site_exception", value: "broader_engineering_review" }], summary: "One site temporarily reviews all work above 5,000 in engineering." },
  { title: "ERP-PM work-order object export", evidenceType: "SYSTEM_EXPORT", sourceClass: "SYSTEM_OF_RECORD", scope: "WORKFLOW", requirementIds: ["EVID-003", "EVID-005"], claims: [{ key: "wo_status_values", value: "CREATED,APPROVED,READY,SCHEDULED,CLOSED" }], summary: "Status lifecycle and timestamps available for cycle-time measurement." },
  { title: "Integration landscape diagram", evidenceType: "ARCHITECTURE_DOCUMENT", sourceClass: "CLIENT_AUTHORITATIVE", scope: "WORKFLOW", requirementIds: ["EVID-005"], claims: [], summary: "Workbench ↔ ERP-PM and Field Mobility App interfaces; ownership of lifecycle transitions unclear." },
] as const;

export function demoIntegrationContract(): Omit<IntegrationDataContract, "schema" | "version"> {
  return {
    sourceWorkflowVersion: "",
    integrations: [
      { integrationId: "INT-001", name: "Field Mobility App → Factory request intake", system: "Field Mobility App", businessNeed: "Requests raised in the field must reach planning with asset context.", logicalContract: "Request + user context event", physicalRealization: "Existing REST webhook (documented)", runtimeVerification: "TO_CONFIRM", requirementStatus: "REQUIRED", readiness: "CLIENT_CONFIRMED", modes: ["EVENT", "READ"], mockability: "MOCK_ALLOWED_FOR_NON_PRODUCTION_TEST", workflowStepIds: ["WF-001"], evidenceRefs: ["EV-006"], owner: "Client architect", readinessHistory: [] },
      { integrationId: "INT-002", name: "Factory ↔ ERP-PM work-order lifecycle", system: "Asset Registry (ERP-PM)", businessNeed: "Approved plans become work orders; readiness status must flow back.", logicalContract: "Read asset + work order; governed write on approval and readiness", physicalRealization: "TO_CONFIRM — BAPI vs. integration middleware", runtimeVerification: "TO_CONFIRM", requirementStatus: "REQUIRED", readiness: "CLIENT_CONFIRMED", modes: ["READ", "WRITE"], writeAuthority: { aiMayPrepare: true, aiMayInitiate: false, executionPermission: "Integration service account wo-writer", humanBusinessAuthority: "Operations Manager approval (WF-004-A01)" }, mockability: "REAL_INTERFACE_REQUIRED_BEFORE_UAT", workflowStepIds: ["WF-001", "WF-004", "WF-005"], evidenceRefs: ["EV-005", "EV-006"], owner: "Client architect", readinessHistory: [] },
      { integrationId: "INT-003", name: "Parts catalogue read", system: "Parts Catalogue", businessNeed: "Estimates need current parts pricing.", logicalContract: "Read parts and prices", physicalRealization: "Nightly extract (documented)", runtimeVerification: "TO_CONFIRM", requirementStatus: "REQUIRED", readiness: "CLIENT_CONFIRMED", modes: ["BATCH", "READ"], mockability: "MOCK_ALLOWED_FOR_BUILD", workflowStepIds: ["WF-002"], evidenceRefs: ["EV-006"], owner: "Client architect", readinessHistory: [] },
    ],
    data: [
      { dataId: "DATA-001", name: "Work order", entity: "WorkOrder", systemOfRecord: "Asset Registry (ERP-PM)", readAuthority: "Planner, Scheduler, AI read", writeAuthority: "System on human approval only", sensitivity: "INTERNAL", workflowStepIds: ["WF-004", "WF-005"], status: "DEFINED" },
      { dataId: "DATA-002", name: "Maintenance request", entity: "Request", systemOfRecord: "Planning Workbench", readAuthority: "All workflow roles", writeAuthority: "Requester, AI completeness fields", sensitivity: "INTERNAL", workflowStepIds: ["WF-001"], status: "DEFINED" },
    ],
  };
}

export function demoTransformationPlan(): Omit<TransformationPlan, "schema" | "version" | "sourceWorkflowVersion" | "sourceTechnicalDesignVersion"> {
  return {
    workPackages: [
      { packageId: "WP-001", scope: "Intake completeness assistant", deliverable: "Completeness check + asset match on WF-001", workflowStepIds: ["WF-001"], activities: [{ name: "Design completeness rules", humanHours: 40, aiAddressable: true, aiProductivityAssumption: 0.3, assumptionRationale: "Rule drafting from the procedure is well-bounded" }, { name: "Build and unit test", humanHours: 80, aiAddressable: true, aiProductivityAssumption: 0.45, assumptionRationale: "Coding assistant on a small service with existing patterns" }, { name: "Client verification of rules", humanHours: 16, aiAddressable: false, nonCompressibleFloor: "HUMAN_VERIFICATION" }], humanLedEffortRange: { low: 120, high: 160 }, humanLedElapsedDays: 15, compressibleElements: ["Rule drafting", "Coding"], nonCompressibleCriticalPath: ["Client verification"], clientDependencies: ["Asset registry read access"], reuseIncluded: ["AI-001 routing rules engine"], dependsOn: [], confidence: "MEDIUM", calibrationNote: "Similar assistant delivered previously; assumptions from that calibration." },
      { packageId: "WP-002", scope: "Planning proposal agent", deliverable: "Draft plan, parts and estimate on WF-002", workflowStepIds: ["WF-002"], activities: [{ name: "Prompt and tool design", humanHours: 60, aiAddressable: true, aiProductivityAssumption: 0.25, assumptionRationale: "Iterative evaluation dominates" }, { name: "Evaluation against historical plans", humanHours: 60, aiAddressable: false, nonCompressibleFloor: "EVALUATION" }, { name: "Build", humanHours: 100, aiAddressable: true, aiProductivityAssumption: 0.4, assumptionRationale: "Standard service scaffolding" }], humanLedEffortRange: { low: 200, high: 260 }, humanLedElapsedDays: 25, compressibleElements: ["Build"], nonCompressibleCriticalPath: ["Evaluation"], clientDependencies: ["Historical plan data extract"], reuseIncluded: ["AI-002 estimate template"], dependsOn: ["WP-001"], confidence: "LOW", calibrationNote: "First agent of this type for the client; low confidence." },
      { packageId: "WP-003", scope: "Approval routing and ERP-PM writeback", deliverable: "Threshold routing, human approval, governed write on WF-004/WF-005", workflowStepIds: ["WF-004", "WF-005"], activities: [{ name: "Integration build INT-002", humanHours: 120, aiAddressable: true, aiProductivityAssumption: 0.2, assumptionRationale: "Middleware specifics dominate" }, { name: "Security and privacy review", humanHours: 24, aiAddressable: false, nonCompressibleFloor: "GOVERNANCE" }, { name: "UAT window", humanHours: 40, aiAddressable: false, nonCompressibleFloor: "UAT_WINDOW" }], humanLedEffortRange: { low: 170, high: 220 }, humanLedElapsedDays: 30, compressibleElements: ["Integration build"], nonCompressibleCriticalPath: ["Security review", "UAT window"], clientDependencies: ["ERP-PM interface decision", "UAT environment"], reuseIncluded: [], dependsOn: ["WP-001"], confidence: "MEDIUM", calibrationNote: "Depends on INT-002 physical realization decision." },
    ],
    humanAdoptionPlan: ["Planner champions in the first site", "Operations Manager approval walkthrough", "Scheduler readiness dashboard training"],
    complianceRiskReadout: ["Financial threshold control must be demonstrably preserved (hard stop)", "AI writeback to ERP-PM is prepared, never initiated by AI"],
    economics: { provided: false, note: "Not requested" },
  };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export type SeedTarget = LifecycleStage;

class Driver {
  state: FactoryState;
  constructor(state: FactoryState) {
    this.state = state;
  }
  do(actor: Actor, actionType: ActionRequest["actionType"], payload?: Record<string, unknown>, extra?: Partial<ActionRequest>) {
    const res = applyAction(this.state, { engagementId: this.state.engagement_id, expectedStateRevision: this.state.stateRevision, actor, actionType, payload, ...extra }, undefined);
    this.state = res.state;
    return res;
  }
  stage() {
    return this.state.currentStage;
  }
}

/** Build the demo engagement up to (and including entering) `target`. */
export function buildDemoEngagement(target: SeedTarget = "TARGET_DESIGN"): EngagementRecord {
  const state = createEngagementState({ clientName: "Synthetic Client", engagementName: "Field Service Work Orders", workflowName: "Request to ready-for-schedule", consultantName: "C. Rivera", clientObjective: "Reduce request-to-ready-for-schedule cycle time without weakening approval controls.", industry: "Industrial services", engagementId: DEMO_ENGAGEMENT_ID }, "2026-09-01T09:00:00.000Z");
  const d = new Driver(state);
  const { consultant, lead, owner, processOwner, architect, itOps, security, arb } = ACTORS;
  const order = ["DISCOVERY", "BASELINE_DESIGN", "BASELINE_APPROVAL", "TARGET_PATH_SELECTION", "TARGET_DESIGN", "TARGET_DESIGN_APPROVAL", "EXPERIENCE", "INTEGRATION_DATA_READINESS", "TECHNICAL_DESIGN", "TRANSFORMATION_PLANNING", "BUILD_CONTRACT", "IMPLEMENTATION_READINESS", "CLIENT_SDLC", "IMPLEMENTATION_VALIDATION", "RELEASE_READINESS", "HYPERCARE", "OPERATE_CI"] as const;
  const want = (s: LifecycleStage) => order.indexOf(target) >= order.indexOf(s);

  // DISCOVERY
  d.do(consultant, "UPLOAD_EVIDENCE", { records: DEMO_EVIDENCE.map((e) => ({ ...e, requirementIds: [...e.requirementIds], claims: [...e.claims] })) });
  // The interview notes contradict the policy on the threshold → resolve, superseding the informal claim.
  const con = d.state.discoverySufficiency.contradictions.find((c) => c.status === "OPEN");
  if (con) d.do(owner, "RESOLVE_CONTRADICTION", { contradictionId: con.contradictionId, resolution: "Policy document is authoritative: threshold is 15,000. Interview recollection superseded.", supersedeEvidenceRefs: ["EV-003"] });
  const openTc = d.state.openItems.find((o) => o.status === "OPEN" && o.kind === "TO_CONFIRM");
  if (openTc) d.do(owner, "ANSWER_QUESTION", { itemId: openTc.itemId, answer: "Reduce request-to-ready-for-schedule cycle time while preserving approval controls." });
  if (!want("BASELINE_DESIGN")) return finish(d);
  // Enterprise context is grounded and confirmed before any workflow is designed on top of it.
  d.do(consultant, "SET_ENTERPRISE_CONTEXT", { op: "REPLACE", enterpriseContext: {
    summary: "Asset-intensive operator running maintenance on an ERP plant-maintenance module with a field mobility app and a parts catalogue; integrations run through a documented middleware layer.",
    architectureStandards: [{ name: "Integration through the enterprise middleware layer", detail: "Point-to-point interfaces to ERP-PM are not permitted for new systems.", qualifier: "All new integrations", owner: "Enterprise architecture", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }, { name: "Reuse the central observability ecosystem", detail: "Logging, APM, alerting and SIEM are shared platforms.", qualifier: "All workloads", owner: "IT operations", evidenceRefs: [], status: "CLIENT_STATED" }],
    systems: [{ name: "Asset Registry (ERP-PM)", detail: "System of record for assets and work orders; owns the work-order status lifecycle.", qualifier: "System of record · on-premise", owner: "IT applications", evidenceRefs: ["EV-005", "EV-006"], status: "DOCUMENTED" }, { name: "Field Mobility App", detail: "Technicians raise requests with asset context.", qualifier: "Front end · vendor SaaS", owner: "Field operations", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }, { name: "Planning Workbench", detail: "Planners assemble plans and estimates.", qualifier: "Internal application", owner: "Maintenance planning", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }, { name: "Parts Catalogue", detail: "Parts master and pricing, extracted nightly.", qualifier: "System of record for parts", owner: "Supply chain", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }],
    integrationPatterns: [{ name: "Field Mobility App → Workbench request event", detail: "REST webhook on request submission.", qualifier: "Event · REST", owner: "Client architect", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }, { name: "Workbench ↔ ERP-PM work-order lifecycle", detail: "Read asset and work order; write on approval and readiness. Ownership of lifecycle transitions unclear.", qualifier: "Read/write · middleware", owner: "Client architect", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }, { name: "Parts Catalogue nightly extract", detail: "Batch file into the Workbench.", qualifier: "Batch", owner: "Supply chain", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }],
    dataDomains: [{ name: "Work order", detail: "Lifecycle CREATED → APPROVED → READY → SCHEDULED → CLOSED with timestamps.", qualifier: "Asset Registry (ERP-PM)", owner: "Maintenance operations", sensitivity: "INTERNAL", evidenceRefs: ["EV-005"], status: "DOCUMENTED" }, { name: "Asset", detail: "Asset master and criticality.", qualifier: "Asset Registry (ERP-PM)", owner: "Reliability engineering", sensitivity: "INTERNAL", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }, { name: "Parts and pricing", detail: "Parts master with current prices.", qualifier: "Parts Catalogue", owner: "Supply chain", sensitivity: "CONFIDENTIAL", evidenceRefs: ["EV-006"], status: "DOCUMENTED" }],
    securityCompliance: [{ name: "Financial approval thresholds enforced by policy", detail: "Work orders above the policy threshold need Operations Manager approval; AI may prepare but not approve.", qualifier: "Financial approval policy", owner: "Finance", evidenceRefs: ["EV-002"], status: "DOCUMENTED" }],
    aiPolicy: [{ name: "AI may recommend, humans approve", detail: "No AI-initiated write to the system of record without a named human approval.", qualifier: "Stated by client architect", owner: "Client architect", evidenceRefs: [], status: "CLIENT_STATED" }],
    gaps: ["Who owns work-order lifecycle transitions in the middleware layer", "Whether the middleware exposes a governed write for readiness status"],
  } });
  d.do(architect, "SET_ENTERPRISE_CONTEXT", { confirm: true }, { reason: "Landscape reflects the current integration diagram and ERP-PM ownership." });
  d.do(consultant, "ADVANCE_STAGE");

  // BASELINE_DESIGN
  d.do(consultant, "UPDATE_BLUEPRINT", { op: "REPLACE_BLUEPRINT", blueprint: demoBlueprint(d.state.workflowId), summary: "Baseline reconstructed from PM-OPS-17 and interviews" });
  d.do(consultant, "SET_VALUE_NORTH_STAR", { valueNorthStar: { objective: "Reduce elapsed time from request to ready-for-schedule while preserving approval controls.", primaryMetric: "Request-to-ready cycle time", metricDefinition: "Elapsed hours from request confirmed (WF-001) to READY_FOR_SCHEDULE (WF-005).", measurementGranularity: "Per work order", unit: "hours", direction: "LOWER_IS_BETTER", startEvent: "Request confirmed (WF-001-A01)", endEvent: "ERP-PM status READY", baseline: "52 hours median (ERP-PM export, last 90 days)", target: "24 hours median", owner: "Director, Maintenance Operations", reportingCadence: "Weekly", secondaryMetrics: ["Exception volume", "Approval dwell"] } });
  d.do(processOwner, "UPDATE_BLUEPRINT", { op: "CONFIRM_ALL_STEPS" });
  if (!want("BASELINE_APPROVAL")) return finish(d);
  d.do(consultant, "SUBMIT_FOR_REVIEW");
  d.do(consultant, "ADVANCE_STAGE");

  // BASELINE_APPROVAL
  d.do(consultant, "EVALUATE_GATE");
  if (!want("TARGET_PATH_SELECTION")) return finish(d);
  d.do(owner, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "BASELINE_APPROVAL" }, rationale: "Baseline reflects PM-OPS-17 Rev 5 and current practice." });
  d.do(consultant, "ADVANCE_STAGE");

  // TARGET_PATH_SELECTION
  if (!want("TARGET_DESIGN")) return finish(d);
  d.do(owner, "DECIDE", { type: "SELECT_TARGET_PATH", target: { type: "TARGET_PATH", id: "target-path" }, rationale: "Reimagine around AI-assisted intake and planning; keep approval controls.", payload: { mode: "AI_NATIVE_REIMAGINED" } });
  d.do(consultant, "ADVANCE_STAGE");

  // TARGET_DESIGN — complete every design area.
  if (target === "TARGET_DESIGN") return finish(d);
  completeTargetDesign(d);
  d.do(owner, "SET_VALUE_NORTH_STAR", { valueNorthStar: {}, confirm: true }, { reason: "Metric, events, baseline and target confirmed." });
  d.do(consultant, "SUBMIT_FOR_REVIEW");
  if (!want("TARGET_DESIGN_APPROVAL")) return finish(d);
  d.do(consultant, "ADVANCE_STAGE");
  d.do(consultant, "EVALUATE_GATE");
  if (!want("EXPERIENCE")) return finish(d);
  // EVID-004 (advisory) is absent → gate is CONDITIONAL; the business owner accepts the condition explicitly.
  d.do(owner, "DECIDE", { type: "ACCEPT_CONDITIONAL", target: { type: "GATE", id: "TARGET_DESIGN_APPROVAL" }, rationale: "Brand/experience baseline will be classified in the Experience stage; accepted as a condition." });
  d.do(owner, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "TARGET_DESIGN_APPROVAL" }, rationale: "Target design approved." });
  d.do(consultant, "ADVANCE_STAGE");

  // EXPERIENCE
  if (!want("INTEGRATION_DATA_READINESS")) return finish(d);
  d.do(consultant, "SET_EXPERIENCE", { notes: [{ classification: "EXISTING_EXPERIENCE_BASELINE", statement: "Planners work in the existing workbench; new AI assistance appears as a side panel.", evidenceRefs: ["EV-001"], affectsGovernance: false }, { classification: "ACCESSIBILITY_MANDATORY", statement: "Field app screens must be usable with gloves (large targets).", evidenceRefs: [], affectsGovernance: false }] });
  d.do(consultant, "GENERATE_EXPERIENCE");
  d.do(owner, "DECIDE", { type: "APPROVE", target: { type: "EXPERIENCE", id: "experience" }, rationale: "Representation matches the approved design." });
  d.do(consultant, "ADVANCE_STAGE");

  // INTEGRATION_DATA_READINESS
  d.do(architect, "SET_INTEGRATION_CONTRACT", { contract: demoIntegrationContract() });
  d.do(consultant, "EVALUATE_GATE");
  if (!want("TECHNICAL_DESIGN")) return finish(d);
  d.do(architect, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "INTEGRATION_DATA_READINESS" }, rationale: "Integration contracts confirmed; INT-002 realization tracked as open decision." });
  d.do(consultant, "ADVANCE_STAGE");

  // TECHNICAL_DESIGN
  d.do(architect, "SET_OBSERVABILITY", { observability: { inheritsClientEcosystem: true, loggingPlatform: "Client central logging", tracingPlatform: "Client APM", metricsPlatform: "Client APM", alertingPlatform: "Client on-call tooling", siemPlatform: "Client SIEM", incidentProcess: "Client major-incident process" } });
  d.do(consultant, "UPLOAD_EVIDENCE", { records: [{ title: "IT operations confirmation of observability ecosystem", evidenceType: "CLIENT_CONFIRMATION", sourceClass: "CLIENT_AUTHORITATIVE", scope: "WORKFLOW", requirementIds: ["EVID-006"], claims: [], summary: "Central logging, APM, on-call tooling and SIEM confirmed as the platforms to reuse." }] });
  d.do(consultant, "COMPILE_TECHNICAL_DESIGN");
  // Answer open technical decisions.
  for (const od of d.state.artifactContent[CONTENT_KEYS.technicalDesign] ? ((d.state.artifactContent[CONTENT_KEYS.technicalDesign] as { openDecisions: { decisionKey: string; blocksGate: string }[] }).openDecisions ?? []) : []) {
    if (od.blocksGate === "TECHNICAL_DIRECTION_APPROVAL") d.do(architect, "DECIDE", { type: "ANSWER", target: { type: "DECISION", id: od.decisionKey }, rationale: "Resolved in architecture review." });
  }
  const tdArt = d.state.authoritativeArtifacts.find((a) => a.kind === "CONTROLLED_TECHNICAL_DESIGN" && a.authority === "CURRENT_AUTHORITATIVE");
  d.do(arb, "DECIDE", { type: "APPROVE", target: { type: "ARTIFACT", id: tdArt!.artifactId }, rationale: "ARB: governed ERP-PM write pattern approved." });
  d.do(consultant, "EVALUATE_GATE");
  if (!want("TRANSFORMATION_PLANNING")) return finish(d);
  d.do(architect, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "TECHNICAL_DIRECTION_APPROVAL" }, rationale: "Technical direction approved." });
  d.do(consultant, "ADVANCE_STAGE");

  // TRANSFORMATION_PLANNING
  d.do(consultant, "SET_TRANSFORMATION_PLAN", { plan: demoTransformationPlan() });
  d.do(consultant, "EVALUATE_GATE");
  if (!want("BUILD_CONTRACT")) return finish(d);
  d.do(lead, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "TRANSFORMATION_READINESS" }, rationale: "Plan floors and dependencies accepted." });
  d.do(consultant, "ADVANCE_STAGE");

  // BUILD_CONTRACT
  d.do(consultant, "GENERATE_BUILD_CONTRACT");
  d.do(consultant, "EVALUATE_GATE");
  if (!want("IMPLEMENTATION_READINESS")) return finish(d);
  d.do(architect, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "BUILD_CONTRACT_APPROVAL" }, rationale: "Build contract certified and approved." });
  d.do(consultant, "ADVANCE_STAGE");

  // IMPLEMENTATION_READINESS
  const bcVersion = (d.state.artifactContent[CONTENT_KEYS.buildContract] as { version: string }).version;
  d.do(consultant, "REGISTER_REALIZATION_PLAN", { plan: { buildContractVersion: bcVersion, reuse: ["workbench-rules-engine", "estimate-template-service"], extendOrRefactor: ["planning-workbench-ui"], additions: ["intake-completeness-service", "planning-agent-service", "approval-router"], tests: ["check tests per BU", "action audit tests"], conflicts: [{ unitId: "BU-WF-004", description: "Repository has no service account for ERP-PM writes; proposes using the workbench user context", status: "OPEN" }], submittedBy: "coding-partner" } });
  const pendingConflict = d.state.pendingHumanDecisions.find((p) => p.status === "PENDING" && p.target.type === "BUILD_CONTRACT");
  if (pendingConflict) d.do(architect, "DECIDE", { requestId: pendingConflict.requestId, type: "CORRECT", target: pendingConflict.target, rationale: "Provision the wo-writer service account per INT-002; do not use user context.", payload: { conflictIndex: 0 } });
  d.do(consultant, "EVALUATE_GATE");
  if (!want("CLIENT_SDLC")) return finish(d);
  d.do(lead, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "IMPLEMENTATION_READINESS" }, rationale: "Ready for client SDLC." });
  d.do(consultant, "ADVANCE_STAGE");

  // CLIENT_SDLC → implementation evidence
  if (!want("IMPLEMENTATION_VALIDATION")) return finish(d);
  const claims = (extra: { key: string; value: string }[] = []) => [
    { key: "source_ids_present", value: "TRUE" },
    { key: "do_not_replace_respected", value: "TRUE" },
    { key: "treatment_honoured", value: "TRUE" },
    { key: "constraints_honoured", value: "TRUE" },
    { key: "hard_stops_enforced", value: "TRUE" },
    { key: "human_actions_audited", value: "TRUE" },
    { key: "check_execution_distinct", value: "TRUE" },
    { key: "rerun_supported", value: "TRUE" },
    { key: "writeback_bounded", value: "TRUE" },
    { key: "tests_passing", value: "TRUE" },
    { key: "value_telemetry", value: "TRUE" },
    { key: "observability_aligned", value: "TRUE" },
    { key: "ci_governed", value: "TRUE" },
    { key: "arb_reviewed", value: "TRUE" },
    ...extra,
  ];
  d.do(consultant, "UPLOAD_EVIDENCE", { records: [
    { title: "PR #42 — intake, planning, approval, readiness services", evidenceType: "REPOSITORY_CODE", sourceClass: "SYSTEM_OF_RECORD", scope: "IMPLEMENTATION", requirementIds: ["EVID-007"], claims: claims(), summary: "Merged PR implementing BU-WF-001..005 and BU-CI." },
    { title: "CI test run #1187", evidenceType: "TEST_RESULTS", sourceClass: "SYSTEM_OF_RECORD", scope: "IMPLEMENTATION", requirementIds: ["EVID-008"], claims: [{ key: "tests_passing", value: "TRUE" }], summary: "212 tests passing including check and action audit tests." },
  ] });
  d.do(consultant, "ADVANCE_STAGE");

  // IMPLEMENTATION_VALIDATION
  d.do(consultant, "RUN_VALIDATION");
  d.do(itOps, "UPDATE_INTEGRATION", { integrationId: "INT-002", readiness: "INTERFACE_IDENTIFIED" });
  d.do(itOps, "UPDATE_INTEGRATION", { integrationId: "INT-002", readiness: "ACCESS_PLANNED" });
  d.do(itOps, "UPDATE_INTEGRATION", { integrationId: "INT-002", readiness: "ACCESS_READY" });
  d.do(consultant, "UPLOAD_EVIDENCE", { records: [{ title: "INT-002 UAT connectivity trace", evidenceType: "RUNTIME_TRACE", sourceClass: "SYSTEM_OF_RECORD", scope: "INTEGRATION", environment: "UAT", requirementIds: ["EVID-009"], claims: [], summary: "Read/write round trip against ERP-PM UAT." }] });
  const traceRef = d.state.evidenceCatalog[d.state.evidenceCatalog.length - 1].evidenceRef;
  d.do(itOps, "UPDATE_INTEGRATION", { integrationId: "INT-002", readiness: "CONNECTED", evidenceRef: traceRef });
  d.do(consultant, "EVALUATE_GATE");
  if (!want("RELEASE_READINESS")) return finish(d);
  d.do(itOps, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "TEST_READINESS" }, rationale: "Test readiness approved." });
  d.do(consultant, "ADVANCE_STAGE");

  // RELEASE_READINESS
  d.do(itOps, "UPDATE_INTEGRATION", { integrationId: "INT-002", readiness: "CONTRACT_TESTED", evidenceRef: traceRef });
  d.do(consultant, "UPLOAD_EVIDENCE", { records: [
    { title: "INT-002 production end-to-end verification trace", evidenceType: "RUNTIME_TRACE", sourceClass: "SYSTEM_OF_RECORD", scope: "INTEGRATION", environment: "PRODUCTION", requirementIds: ["EVID-009"], claims: [], summary: "Production read + governed write verified." },
    { title: "Production deployment manifest", evidenceType: "DEPLOYMENT_CONFIG", sourceClass: "SYSTEM_OF_RECORD", scope: "DEPLOYMENT", environment: "PRODUCTION", requirementIds: ["EVID-010"], claims: [], summary: "Release 1.0.0 deployed to production cluster." },
    { title: "Security & privacy sign-off", evidenceType: "CLIENT_CONFIRMATION", sourceClass: "CLIENT_AUTHORITATIVE", scope: "WORKFLOW", requirementIds: ["EVID-011"], claims: [], summary: "Signed off by security and privacy." },
  ] });
  const prodTrace = d.state.evidenceCatalog.find((e) => e.title.startsWith("INT-002 production"))!.evidenceRef;
  d.do(itOps, "UPDATE_INTEGRATION", { integrationId: "INT-002", readiness: "END_TO_END_VERIFIED", evidenceRef: prodTrace });
  for (const id of ["INT-001", "INT-003"]) {
    const cur = (d.state.artifactContent[CONTENT_KEYS.integrationContract] as IntegrationDataContract).integrations.find((i) => i.integrationId === id)!;
    const path = ["INTERFACE_IDENTIFIED", "ACCESS_PLANNED", "ACCESS_READY", "CONNECTED", "CONTRACT_TESTED", "END_TO_END_VERIFIED"] as const;
    for (const st of path) {
      if (path.indexOf(st) < path.indexOf(cur.readiness as (typeof path)[number])) continue;
      d.do(itOps, "UPDATE_INTEGRATION", { integrationId: id, readiness: st, evidenceRef: prodTrace });
    }
  }
  d.do(consultant, "RUN_VALIDATION");
  d.do(consultant, "EVALUATE_GATE");
  if (!want("HYPERCARE")) return finish(d);
  d.do(security, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "PRODUCTION_READINESS" }, rationale: "Production readiness approved." });
  d.do(consultant, "ADVANCE_STAGE");

  // HYPERCARE
  d.do(consultant, "UPLOAD_EVIDENCE", { records: [{ title: "Hypercare incident and exception log (weeks 1–4)", evidenceType: "SYSTEM_EXPORT", sourceClass: "SYSTEM_OF_RECORD", scope: "WORKFLOW", environment: "PRODUCTION", requirementIds: ["EVID-012", "EVID-013"], claims: [], summary: "3 minor incidents, 0 approval-control breaches; cycle-time telemetry flowing." }] });
  d.do(consultant, "EVALUATE_GATE");
  if (!want("OPERATE_CI")) return finish(d);
  d.do(owner, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "HYPERCARE_EXIT" }, rationale: "Hypercare exit approved." });
  d.do(consultant, "ADVANCE_STAGE");
  d.do(consultant, "EVALUATE_GATE");
  return finish(d);
}

function completeTargetDesign(d: Driver) {
  const { consultant, processOwner, architect } = ACTORS;
  const bp = d.state.artifactContent[CONTENT_KEYS.blueprint] as Blueprint;
  for (const st of bp.steps) {
    const ai = st.type === "ai" || st.type === "mixed";
    d.do(architect, "UPDATE_BLUEPRINT", { op: "SET_AUTHORITY", stepId: st.contractId, authority: { autonomyLevel: ai ? "RECOMMEND" : "NONE", aiCanEvaluate: ai, aiCanRecommend: ai, aiCanExecute: false, aiCanWriteback: false, aiCanAdvance: false, humanApprovalRequired: st.contractId === "WF-005" ? "ON_EXCEPTION" : "ALWAYS", hardGuardrails: ["No AI approval", "No AI-initiated ERP-PM write"] } });
    d.do(architect, "UPDATE_BLUEPRINT", { op: "SET_IMPLEMENTATION", stepId: st.contractId, implementation: { currentState: { assessmentStatus: st.contractId === "WF-002" ? "PARTIAL_CAPABILITY" : st.contractId === "WF-003" ? "NO_CURRENT_CAPABILITY" : "FULL_CAPABILITY", summary: "Assessed from current-state runbook and workbench export.", evidenceRefs: ["EV-001", "EV-005"], services: st.contractId === "WF-001" ? ["workbench-rules-engine"] : st.contractId === "WF-002" ? ["estimate-template-service"] : st.contractId === "WF-003" ? [] : ["workbench-approval-module"], integrations: [], knownLimitations: [] }, targetState: { treatment: st.contractId === "WF-001" ? "EXTEND" : st.contractId === "WF-002" ? "BUILD_NEW" : st.contractId === "WF-003" ? "BUILD_NEW" : "REUSE", rationale: "Per target path AI_NATIVE_REIMAGINED with approval controls preserved.", services: st.contractId === "WF-001" ? ["workbench-rules-engine", "intake-completeness-service"] : st.contractId === "WF-002" ? ["planning-agent-service", "estimate-template-service"] : st.contractId === "WF-003" ? ["engineering-review-pack-service"] : ["workbench-approval-module"], apiContracts: [], dataObjects: ["WorkOrder"], telemetry: ["cycle-time events"], dependencies: st.contractId === "WF-004" ? ["INT-002"] : [], doNotReplace: st.contractId === "WF-004" ? ["workbench-approval-module"] : [] }, arbImpact: { reviewRequired: st.contractId === "WF-004" ? "REQUIRED" : "NONE", reason: st.contractId === "WF-004" ? "Governed write to ERP-PM" : "", topics: st.contractId === "WF-004" ? ["ERP write pattern"] : [] } } });
    for (const r of st.rules) {
      if (r.provenance.status === "UNCONFIRMED") d.do(processOwner, "UPDATE_BLUEPRINT", { op: "SET_RULE", stepId: st.contractId, ruleId: r.ruleId, fields: { provenance: { sourceType: "CLIENT_CONFIRMATION", sourceRef: "", status: "CLIENT_CONFIRMED" } } });
    }
  }
  d.do(processOwner, "UPDATE_BLUEPRINT", { op: "CONFIRM_ALL_CHECKS" });
  d.do(processOwner, "UPDATE_BLUEPRINT", { op: "CONFIRM_ALL_ACTIONS" });
  d.do(processOwner, "UPDATE_BLUEPRINT", { op: "CONFIRM_ALL_CURRENT_AI" });
  d.do(processOwner, "UPDATE_BLUEPRINT", { op: "CONFIRM_ALL_STEPS" });
  void consultant;
}

function finish(d: Driver): EngagementRecord {
  const res = d.do(ACTORS.consultant, "CHECKPOINT", { note: "Seed checkpoint" });
  return { state: res.state, runtime: projectRuntime(res.state) };
}
