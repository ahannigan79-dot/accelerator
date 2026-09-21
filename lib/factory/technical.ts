/**
 * Technical Compiler outputs. Deterministic assembly from the design contract and
 * Integration & Data Contract; AI enrichment (when available) is recorded separately.
 */

import { activeSteps, type Blueprint } from "./blueprint";
import type { IntegrationDataContract } from "./integration";
import type { ITObservability } from "./schema";

export interface AgentContract {
  agentId: string; // AGT-###
  name: string;
  purpose: string;
  workflowStepIds: string[];
  toolsIntegrations: string[];
  readAuthority: string;
  writeAuthority: string;
  humanApprovals: string;
  responsibleAiClassification: "ASSISTIVE" | "DECISION_SUPPORT" | "BOUNDED_AUTONOMY" | "TO_CONFIRM";
  lifecycleStatus: "PROPOSED" | "DESIGNED" | "APPROVED" | "BUILDING" | "VALIDATING" | "DEPLOYED" | "RETIRED";
  reuseDisposition: "REUSE" | "EXTEND" | "NEW" | "RETIRE_MERGE" | "TO_CONFIRM";
}

export interface OpenDecision {
  decisionKey: string; // OD-###
  topic: string;
  detail: string;
  blocksGate: string;
  owner: string;
  arbRequired: boolean;
}

export interface ControlledTechnicalDesign {
  schema: "ai-delivery-controlled-technical-design-v1";
  version: string;
  sourceWorkflowVersion: string;
  sourceIntegrationContractVersion: string;
  components: { name: string; kind: "AI_AGENT" | "DETERMINISTIC_CONTROL" | "SYSTEM_OF_RECORD" | "EXPERIENCE" | "CONTROL_PLANE"; treatment: string; description: string; stepIds: string[] }[];
  agents: AgentContract[];
  reuse: string[];
  extendOrRefactor: string[];
  netNew: string[];
  architectureConstraints: string[];
  notVerified: string[];
  observability: ITObservability & { valueTelemetry: string[]; operationalTelemetry: string[] };
  nfrs: { name: string; target: string; status: "DEFINED" | "TO_CONFIRM" }[];
  openDecisions: OpenDecision[];
  arbNeeds: string[];
  valueMeasurement: string;
  repositoryRealizationLeftToPartner: string[];
  summaryMarkdown: string;
  aiEnrichment?: { specialistId: string; recommendationRef: string; notes: string[] };
}

export function compileTechnicalDesign(bp: Blueprint, idc: IntegrationDataContract | undefined, obs: ITObservability, compiledAt: string): ControlledTechnicalDesign {
  const steps = activeSteps(bp);
  const components: ControlledTechnicalDesign["components"] = [];
  const agents: AgentContract[] = [];
  const reuse: string[] = [];
  const extend: string[] = [];
  const netNew: string[] = [];
  const notVerified: string[] = [];
  const openDecisions: OpenDecision[] = [];
  const arbNeeds: string[] = [];
  let n = 0;
  for (const s of steps) {
    const t = s.implementation.targetState.treatment;
    const services = s.implementation.targetState.services.length ? s.implementation.targetState.services : s.implementation.currentState.services;
    if (["KEEP", "REUSE"].includes(t)) reuse.push(...services.map((x) => `${x} (${s.contractId})`));
    else if (["EXTEND", "REFACTOR", "HARDEN"].includes(t)) extend.push(...services.map((x) => `${x} (${s.contractId})`));
    else if (["BUILD_NEW", "REPLACE"].includes(t)) netNew.push(...services.map((x) => `${x} (${s.contractId})`));
    if (t === "TO_CONFIRM") openDecisions.push({ decisionKey: `OD-${String(++n).padStart(3, "0")}`, topic: `Treatment for ${s.contractId}`, detail: `${s.name}: implementation treatment not classified`, blocksGate: "TECHNICAL_DIRECTION_APPROVAL", owner: "Client architect", arbRequired: false });
    if (s.implementation.currentState.assessmentStatus === "UNASSESSED" || s.implementation.currentState.assessmentStatus === "TO_CONFIRM") notVerified.push(`${s.contractId} current-state capability not verified`);
    if (s.implementation.arbImpact.reviewRequired === "REQUIRED") arbNeeds.push(`${s.contractId}: ${s.implementation.arbImpact.reason || s.implementation.arbImpact.topics.join(", ")}`);
    if (s.implementation.arbImpact.reviewRequired === "TBD") openDecisions.push({ decisionKey: `OD-${String(++n).padStart(3, "0")}`, topic: `ARB assessment for ${s.contractId}`, detail: "ARB impact not assessed", blocksGate: "TECHNICAL_DIRECTION_APPROVAL", owner: "Client architect", arbRequired: true });
    const kind = s.type === "ai" ? "AI_AGENT" : s.type === "system" ? "SYSTEM_OF_RECORD" : s.type === "human" ? "EXPERIENCE" : "DETERMINISTIC_CONTROL";
    components.push({ name: services[0] ?? `${s.name} component`, kind, treatment: t, description: s.purpose, stepIds: [s.contractId] });
    if ((s.type === "ai" || s.type === "mixed") && s.aiRole.trim()) {
      const a = s.authority;
      agents.push({
        agentId: `AGT-${String(agents.length + 1).padStart(3, "0")}`,
        name: `${s.name} assistant`,
        purpose: s.aiRole,
        workflowStepIds: [s.contractId],
        toolsIntegrations: s.systems,
        readAuthority: s.reads.join(", ") || "None declared",
        writeAuthority: a.aiCanWriteback ? s.writes.join(", ") : "None — AI writeback not permitted",
        humanApprovals: a.humanApprovalRequired,
        responsibleAiClassification: a.autonomyLevel === "TBD" ? "TO_CONFIRM" : a.aiCanExecute ? "BOUNDED_AUTONOMY" : a.aiCanRecommend ? "DECISION_SUPPORT" : "ASSISTIVE",
        lifecycleStatus: "PROPOSED",
        reuseDisposition: ["KEEP", "REUSE"].includes(t) ? "REUSE" : ["EXTEND", "REFACTOR", "HARDEN"].includes(t) ? "EXTEND" : t === "TO_CONFIRM" ? "TO_CONFIRM" : "NEW",
      });
    }
  }
  for (const i of idc?.integrations ?? []) {
    if (i.physicalRealization.toUpperCase().includes("TO_CONFIRM") || i.requirementStatus === "TO_CONFIRM") {
      openDecisions.push({ decisionKey: `OD-${String(++n).padStart(3, "0")}`, topic: `${i.integrationId} realization`, detail: `${i.name}: physical realization or requirement status still TO_CONFIRM`, blocksGate: "INTEGRATION_DATA_READINESS", owner: i.owner, arbRequired: false });
    }
  }
  if (!obs.inheritsClientEcosystem && !obs.newParallelPlatformDecisionId) {
    openDecisions.push({ decisionKey: `OD-${String(++n).padStart(3, "0")}`, topic: "Observability platform", detail: "A parallel telemetry platform requires an explicit architecture decision", blocksGate: "TECHNICAL_DIRECTION_APPROVAL", owner: "Client architect", arbRequired: true });
  }
  const constraints = [
    "Reuse the client-approved logging / tracing / metrics / alerting / SIEM ecosystem by default",
    "Operational telemetry and business value telemetry are separate logical planes sharing correlation IDs",
    "No AI self-approval; human actions advance governed states",
    ...steps.flatMap((s) => s.implementation.targetState.doNotReplace.map((d) => `DO NOT REPLACE: ${d} (${s.contractId})`)),
  ];
  const md = [
    `# Technical Design Summary — workflow ${bp.workflowId} v${bp.version}`,
    "",
    `Components: ${components.length} · Proposed agents: ${agents.length} · Open decisions: ${openDecisions.length} · ARB needs: ${arbNeeds.length}`,
    "",
    "## Reuse",
    ...(reuse.length ? reuse.map((r) => `- ${r}`) : ["- none identified"]),
    "## Extend / refactor",
    ...(extend.length ? extend.map((r) => `- ${r}`) : ["- none identified"]),
    "## Net-new",
    ...(netNew.length ? netNew.map((r) => `- ${r}`) : ["- none identified"]),
    "## Not verified",
    ...(notVerified.length ? notVerified.map((r) => `- ${r}`) : ["- nothing outstanding"]),
    "## Value North Star measurement",
    `- ${bp.valueNorthStar.primaryMetric || "TO_CONFIRM"}: ${bp.valueNorthStar.startEvent || "start TO_CONFIRM"} → ${bp.valueNorthStar.endEvent || "end TO_CONFIRM"}`,
  ].join("\n");
  return {
    schema: "ai-delivery-controlled-technical-design-v1",
    version: `${bp.version}-td1`,
    sourceWorkflowVersion: bp.version,
    sourceIntegrationContractVersion: idc?.version ?? "NONE",
    components,
    agents,
    reuse,
    extendOrRefactor: extend,
    netNew,
    architectureConstraints: constraints,
    notVerified,
    observability: {
      ...obs,
      valueTelemetry: [`${bp.valueNorthStar.primaryMetric || "primary metric"} start/end events`, "exception volume", "approval dwell", "human intervention rate"],
      operationalTelemetry: ["requests", "model/tool calls", "retries", "latency", "failures", "integration calls", "correlation IDs", "security/audit events"],
    },
    nfrs: [
      { name: "Auditability", target: "Every human decision attributable; every AI recommendation correlated", status: "DEFINED" },
      { name: "Availability", target: "TO_CONFIRM with client IT", status: "TO_CONFIRM" },
      { name: "Latency", target: "TO_CONFIRM per step", status: "TO_CONFIRM" },
    ],
    openDecisions,
    arbNeeds,
    valueMeasurement: `${bp.valueNorthStar.primaryMetric} measured ${bp.valueNorthStar.measurementGranularity} in ${bp.valueNorthStar.unit}`,
    repositoryRealizationLeftToPartner: ["Module layout and naming", "Framework wiring", "CI pipeline steps", "Physical persistence schema within approved data contracts"],
    summaryMarkdown: `${md}\n\n_Compiled ${compiledAt}_`,
  };
}
