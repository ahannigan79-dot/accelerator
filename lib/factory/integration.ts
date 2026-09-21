/**
 * Integration & Data Readiness — separates business need, logical contract,
 * physical realization and runtime verification. Connectivity never confers authority.
 */

export const INTEGRATION_REQUIREMENT_STATUSES = ["REQUIRED", "CONDITIONAL", "TO_CONFIRM", "NOT_REQUIRED"] as const;
export type IntegrationRequirementStatus = (typeof INTEGRATION_REQUIREMENT_STATUSES)[number];

export const READINESS_LIFECYCLE = [
  "DISCOVERED",
  "REQUIREMENT_DEFINED",
  "CLIENT_CONFIRMED",
  "INTERFACE_IDENTIFIED",
  "ACCESS_PLANNED",
  "ACCESS_READY",
  "CONNECTED",
  "CONTRACT_TESTED",
  "END_TO_END_VERIFIED",
] as const;
export type ReadinessState = (typeof READINESS_LIFECYCLE)[number];

export const INTERACTION_MODES = ["READ", "WRITE", "EVENT", "DOCUMENT", "QUERY", "BATCH", "HUMAN_HANDOFF"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

export const MOCKABILITY = [
  "MOCK_ALLOWED_FOR_BUILD",
  "MOCK_ALLOWED_FOR_NON_PRODUCTION_TEST",
  "REAL_INTERFACE_REQUIRED_BEFORE_BUILD",
  "REAL_INTERFACE_REQUIRED_BEFORE_UAT",
  "REAL_INTERFACE_REQUIRED_BEFORE_RELEASE",
  "TO_CONFIRM",
] as const;
export type Mockability = (typeof MOCKABILITY)[number];

export interface WriteAuthority {
  aiMayPrepare: boolean | null;
  aiMayInitiate: boolean | null;
  executionPermission: string; // who/what executes, e.g. "Service account INT-002-writer"
  humanBusinessAuthority: string; // role that permits the write
}

export interface IntegrationContract {
  integrationId: string; // INT-###
  name: string;
  system: string;
  businessNeed: string; // 1. business need
  logicalContract: string; // 2. logical contract
  physicalRealization: string; // 3. physical realization (may be TO_CONFIRM)
  runtimeVerification: string; // 4. runtime verification evidence ref or TO_CONFIRM
  requirementStatus: IntegrationRequirementStatus;
  readiness: ReadinessState;
  modes: InteractionMode[];
  writeAuthority?: WriteAuthority;
  mockability: Mockability;
  workflowStepIds: string[];
  evidenceRefs: string[];
  owner: string;
  readinessHistory: { from: ReadinessState | null; to: ReadinessState; at: string; evidenceRef?: string; by: string }[];
}

export interface DataContract {
  dataId: string; // DATA-###
  name: string;
  entity: string;
  systemOfRecord: string;
  readAuthority: string;
  writeAuthority: string;
  sensitivity: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "PERSONAL" | "TO_CONFIRM";
  workflowStepIds: string[];
  status: "DEFINED" | "TO_CONFIRM";
}

export interface IntegrationDataContract {
  schema: "ai-delivery-integration-data-contract-v1";
  version: string;
  sourceWorkflowVersion: string;
  integrations: IntegrationContract[];
  data: DataContract[];
}

export function readinessIndex(s: ReadinessState): number {
  return READINESS_LIFECYCLE.indexOf(s);
}

/** Readiness may only advance one state at a time, each with attributable evidence. */
export function canTransition(from: ReadinessState, to: ReadinessState): { ok: boolean; reason: string } {
  const a = readinessIndex(from);
  const b = readinessIndex(to);
  if (b === a + 1) return { ok: true, reason: "" };
  if (b <= a) return { ok: true, reason: "" }; // regression is allowed (e.g. access revoked)
  return { ok: false, reason: `Cannot skip from ${from} to ${to}; next permitted state is ${READINESS_LIFECYCLE[a + 1]}` };
}

export function writeAuthorityComplete(c: IntegrationContract): boolean {
  if (!c.modes.includes("WRITE")) return true;
  const w = c.writeAuthority;
  return !!w && typeof w.aiMayPrepare === "boolean" && typeof w.aiMayInitiate === "boolean" && !!w.executionPermission.trim() && !!w.humanBusinessAuthority.trim();
}

export function atLeast(c: IntegrationContract, s: ReadinessState): boolean {
  return readinessIndex(c.readiness) >= readinessIndex(s);
}

export function integrationBlockers(contract: IntegrationDataContract | undefined, phase: "DESIGN" | "BUILD" | "UAT" | "RELEASE"): string[] {
  if (!contract) return ["No Integration & Data Contract registered"];
  const out: string[] = [];
  for (const c of contract.integrations) {
    if (c.requirementStatus === "NOT_REQUIRED") continue;
    if (phase === "DESIGN") {
      if (c.requirementStatus === "TO_CONFIRM") out.push(`${c.integrationId} ${c.name}: requirement status TO_CONFIRM`);
      if (c.requirementStatus === "REQUIRED" && !atLeast(c, "CLIENT_CONFIRMED")) out.push(`${c.integrationId} ${c.name}: required but not client-confirmed (${c.readiness})`);
      if (!writeAuthorityComplete(c)) out.push(`${c.integrationId} ${c.name}: WRITE mode without complete authority separation`);
    }
    if (phase === "BUILD" && c.mockability === "REAL_INTERFACE_REQUIRED_BEFORE_BUILD" && !atLeast(c, "ACCESS_READY")) out.push(`${c.integrationId}: real interface required before build, readiness is ${c.readiness}`);
    if (phase === "UAT" && ["REAL_INTERFACE_REQUIRED_BEFORE_BUILD", "REAL_INTERFACE_REQUIRED_BEFORE_UAT"].includes(c.mockability) && !atLeast(c, "CONNECTED")) out.push(`${c.integrationId}: real interface required before UAT, readiness is ${c.readiness}`);
    if (phase === "RELEASE" && c.mockability !== "MOCK_ALLOWED_FOR_BUILD" && !atLeast(c, "END_TO_END_VERIFIED")) out.push(`${c.integrationId}: not END_TO_END_VERIFIED (${c.readiness}); mock success never proves production readiness`);
    if (phase === "RELEASE" && c.mockability === "TO_CONFIRM") out.push(`${c.integrationId}: mockability TO_CONFIRM`);
  }
  return out;
}
