/**
 * Code Validator — implementation validation against the Build Contract.
 * Evidence hierarchy: repository code / PR diff > automated tests > runtime traces >
 * config/deployment > screenshots. Design documents and developer statements are never deployment proof.
 */

import type { BuildContract } from "./build";
import type { EvidenceRecord, EvidenceType } from "./schema";

export type UnitStatus = "PASS" | "PARTIAL" | "GAP" | "FAIL" | "NOT_ASSESSED";

export const EVIDENCE_HIERARCHY: EvidenceType[] = ["REPOSITORY_CODE", "TEST_RESULTS", "RUNTIME_TRACE", "DEPLOYMENT_CONFIG", "SCREENSHOT"];
const NON_PROOF: EvidenceType[] = ["DESIGN_DOCUMENT", "DEVELOPER_STATEMENT", "SIMULATION_RESULT"];

export interface UnitValidation {
  unitId: string;
  status: UnitStatus;
  evidenceRefs: string[];
  highestEvidenceTier: EvidenceType | null;
  findings: string[];
  checks: { name: string; result: "PASS" | "FAIL" | "NOT_ASSESSED"; detail: string }[];
}

export interface ValidationReport {
  schema: "ai-delivery-code-validation-report-v1";
  version: string;
  buildContractVersion: string;
  generatedAt: string;
  units: UnitValidation[];
  summary: Record<UnitStatus, number>;
  deploymentClaimed: boolean;
  deploymentProven: boolean;
}

function tierOf(t: EvidenceType): number {
  const i = EVIDENCE_HIERARCHY.indexOf(t);
  return i === -1 ? 99 : i;
}

export function validateImplementation(bc: BuildContract, evidence: EvidenceRecord[], now: string): ValidationReport {
  const units: UnitValidation[] = [...bc.units, bc.continuousImprovementUnit].map((u) => {
    const scoped = evidence.filter((e) => e.authorityStatus === "CURRENT" && !e.synthetic && (e.scope === `UNIT:${u.unitId}` || e.scope === `STEP:${u.sourceStepId}` || e.scope === "IMPLEMENTATION"));
    const proof = scoped.filter((e) => EVIDENCE_HIERARCHY.includes(e.evidenceType));
    const nonProof = scoped.filter((e) => NON_PROOF.includes(e.evidenceType));
    const findings: string[] = [];
    const checks: UnitValidation["checks"] = [];
    if (u.unresolvedDecisions.length) findings.push(`Unresolved decisions must not be hard-coded: ${u.unresolvedDecisions.join("; ")}`);
    if (!proof.length) {
      if (nonProof.length) findings.push(`${nonProof.length} document/statement record(s) present but none count as implementation proof`);
      return { unitId: u.unitId, status: "NOT_ASSESSED", evidenceRefs: scoped.map((e) => e.evidenceRef), highestEvidenceTier: null, findings, checks };
    }
    const claims = new Map(proof.flatMap((e) => e.claims.map((c) => [c.key, c.value] as const)));
    const claim = (k: string) => claims.get(k);
    const assess = (name: string, key: string, expected = "TRUE") => {
      const v = claim(key);
      if (v === undefined) checks.push({ name, result: "NOT_ASSESSED", detail: `no claim ${key}` });
      else checks.push({ name, result: v === expected ? "PASS" : "FAIL", detail: `${key}=${v}` });
    };
    assess("Source-ID coverage (canonical check/action IDs present in code)", "source_ids_present");
    assess("Reuse / do-not-replace compliance", "do_not_replace_respected");
    assess("Target treatment honoured", "treatment_honoured");
    assess("Architecture constraints", "constraints_honoured");
    assess("Rules / hard stops enforced", "hard_stops_enforced");
    assess("Human action transitions recorded", "human_actions_audited");
    assess("Check execution distinct from downstream consumption", "check_execution_distinct");
    assess("Rerun / recovery", "rerun_supported");
    assess("Writeback boundaries", "writeback_bounded");
    assess("Tests present and passing", "tests_passing");
    assess("Value telemetry emitted", "value_telemetry");
    assess("Client IT observability alignment", "observability_aligned");
    if (u.unitId === "BU-CI") assess("CI instrumentation / governance", "ci_governed");
    if (u.arb.reviewRequired === "REQUIRED") assess("ARB-sensitive change reviewed", "arb_reviewed");
    const fails = checks.filter((c) => c.result === "FAIL");
    const notAssessed = checks.filter((c) => c.result === "NOT_ASSESSED");
    const hardFail = fails.some((f) => /hard stops|do-not-replace|writeback|human action/i.test(f.name));
    let status: UnitStatus;
    if (hardFail) status = "FAIL";
    else if (fails.length) status = "GAP";
    else if (notAssessed.length || u.unresolvedDecisions.length) status = "PARTIAL";
    else status = "PASS";
    const highest = proof.map((e) => e.evidenceType).sort((a, b) => tierOf(a) - tierOf(b))[0] ?? null;
    return { unitId: u.unitId, status, evidenceRefs: scoped.map((e) => e.evidenceRef), highestEvidenceTier: highest, findings, checks };
  });
  const summary: Record<UnitStatus, number> = { PASS: 0, PARTIAL: 0, GAP: 0, FAIL: 0, NOT_ASSESSED: 0 };
  units.forEach((u) => summary[u.status]++);
  const deployment = evidence.filter((e) => e.authorityStatus === "CURRENT" && !e.synthetic && e.scope === "DEPLOYMENT");
  return {
    schema: "ai-delivery-code-validation-report-v1",
    version: `${bc.version}-val${now.slice(0, 10)}`,
    buildContractVersion: bc.version,
    generatedAt: now,
    units,
    summary,
    deploymentClaimed: deployment.length > 0,
    deploymentProven: deployment.some((e) => ["DEPLOYMENT_CONFIG", "RUNTIME_TRACE"].includes(e.evidenceType) && e.environment !== "NONE"),
  };
}
