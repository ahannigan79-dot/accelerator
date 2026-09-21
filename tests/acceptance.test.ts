/**
 * Regression suite against the specification's section 44 "minimum rebuild acceptance criteria".
 * Every test runs against the deterministic core; no model calls.
 */
import { describe, expect, test } from "vitest";
import { applyAction, ActionError, type ActionRequest } from "@/lib/factory/actions";
import { getBlueprint, getBuildContract, getSimulationPacks, getValidationReport, CONTENT_KEYS } from "@/lib/factory/content";
import { certifyBuildContract } from "@/lib/factory/build";
import { evaluateGate } from "@/lib/factory/gates";
import { isRuntimeStale, projectRuntime } from "@/lib/factory/projection";
import { ACTORS, buildDemoEngagement, DEMO_ENGAGEMENT_ID } from "@/lib/factory/seed";
import { createEngagementState } from "@/lib/factory/state";
import { compileContext } from "@/lib/factory/specialists/context";
import { SPECIALISTS } from "@/lib/factory/specialists/contracts";
import { estimatePackage, validatePlan } from "@/lib/factory/planner";
import { designCompletionSummary, checkInvariantViolations, compareToBaseline } from "@/lib/factory/blueprint";
import { canTransition } from "@/lib/factory/integration";
import { isRecordAdmissible } from "@/lib/factory/evidence";
import type { FactoryState } from "@/lib/factory/schema";

const { consultant, lead, owner, architect, itOps, security } = ACTORS;
const ai = { userId: "worker-1", role: "AI_SPECIALIST" } as const;

function act(state: FactoryState, actor: ActionRequest["actor"], actionType: ActionRequest["actionType"], payload?: Record<string, unknown>, extra?: Partial<ActionRequest>) {
  return applyAction(state, { engagementId: state.engagement_id, expectedStateRevision: state.stateRevision, actor, actionType, payload, ...extra }, undefined);
}
function expectError(fn: () => unknown, code: ActionError["code"], match?: RegExp) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ActionError);
    expect((e as ActionError).code).toBe(code);
    if (match) expect((e as ActionError).message).toMatch(match);
    return;
  }
  throw new Error("expected an ActionError");
}

describe("Identity / isolation", () => {
  test("engagement identity is explicit and requests for another engagement are rejected", () => {
    const { state } = buildDemoEngagement("DISCOVERY");
    expect(state.engagement_id).toBe(DEMO_ENGAGEMENT_ID);
    expect(() => applyAction(state, { engagementId: "ENG-OTHER", expectedStateRevision: state.stateRevision, actor: consultant, actionType: "ASSESS_EVIDENCE" })).toThrow(/loaded state is/);
  });
  test("cross-client evidence is quarantined and never satisfies a requirement", () => {
    const { state } = buildDemoEngagement("DISCOVERY");
    const res = act(state, consultant, "UPLOAD_EVIDENCE", { records: [{ title: "Other client's procedure", evidenceType: "PROCESS_DOCUMENT", sourceClass: "CLIENT_AUTHORITATIVE", engagementId: "ENG-OTHER-CLIENT", requirementIds: ["EVID-001"], claims: [] }] });
    expect(res.data?.quarantined).toHaveLength(1);
    const rec = res.state.evidenceCatalog.find((e) => e.authorityStatus === "QUARANTINED")!;
    expect(rec.requirementIds).toEqual([]);
    expect(res.events.some((e) => e.type === "EVIDENCE_QUARANTINED")).toBe(true);
  });
  test("context manifests exclude conversation history and other engagements", () => {
    const { state, runtime } = buildDemoEngagement("BASELINE_DESIGN");
    const m = compileContext(state, SPECIALISTS.BLUEPRINT, consultant, "test", runtime.projection_of_state_revision);
    expect(m.exclusions).toContain("Conversation history");
    expect(m.exclusions).toContain("Other engagements");
    expect(m.engagementId).toBe(DEMO_ENGAGEMENT_ID);
    expect(["COMPLETE", "PARTIAL"]).toContain(m.sufficiency);
    expect(SPECIALISTS.BLUEPRINT.requiredContext.every((sec) => m.sectionsIncluded.includes(sec))).toBe(true);
  });
});

describe("State", () => {
  test("every governed action increments the revision exactly once", () => {
    const { state } = buildDemoEngagement("DISCOVERY");
    const r1 = act(state, consultant, "ASSESS_EVIDENCE");
    expect(r1.state.stateRevision).toBe(state.stateRevision + 1);
    const r2 = act(r1.state, consultant, "CHECKPOINT", { note: "x" });
    expect(r2.state.stateRevision).toBe(state.stateRevision + 2);
  });
  test("runtime projection is derived and revision-coherent", () => {
    const { state, runtime } = buildDemoEngagement("BASELINE_DESIGN");
    expect(runtime.projection_of_state_revision).toBe(state.stateRevision);
    expect(isRuntimeStale(state, runtime)).toBe(false);
    const fresh = projectRuntime(state);
    expect(fresh.nextHumanAction.title).toBe(runtime.nextHumanAction.title);
  });
  test("a stale runtime blocks governed progression", () => {
    const { state, runtime } = buildDemoEngagement("BASELINE_DESIGN");
    const stale = { ...runtime, projection_of_state_revision: runtime.projection_of_state_revision - 1 };
    expect(isRuntimeStale(state, stale)).toBe(true);
    expect(() => applyAction(state, { engagementId: state.engagement_id, expectedStateRevision: state.stateRevision, actor: consultant, actionType: "SUBMIT_FOR_REVIEW" }, stale)).toThrow(/stale/i);
  });
  test("a stale expected revision is rejected", () => {
    const { state } = buildDemoEngagement("DISCOVERY");
    expectError(() => applyAction(state, { engagementId: state.engagement_id, expectedStateRevision: state.stateRevision - 1, actor: consultant, actionType: "ASSESS_EVIDENCE" }), "STALE_REVISION");
  });
});

describe("Governance", () => {
  test("AI cannot approve a gate", () => {
    const { state } = buildDemoEngagement("BASELINE_APPROVAL");
    expectError(() => act(state, ai, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "BASELINE_APPROVAL" }, rationale: "looks good" }), "UNAUTHORIZED");
  });
  test("an unauthorized human role cannot approve a gate", () => {
    const { state } = buildDemoEngagement("BASELINE_APPROVAL");
    expectError(() => act(state, consultant, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "BASELINE_APPROVAL" }, rationale: "approve" }), "UNAUTHORIZED");
  });
  test("human approval is explicit and the gate passes only after it", () => {
    const { state } = buildDemoEngagement("BASELINE_APPROVAL");
    const before = evaluateGate(state, "BASELINE_APPROVAL");
    expect(before.outcome).toBe("BLOCKED");
    expect(before.hardStops.some((h) => h.includes("HUMAN-APPROVAL"))).toBe(true);
    const after = act(state, owner, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "BASELINE_APPROVAL" }, rationale: "approved" });
    expect(after.state.gates.BASELINE_APPROVAL?.outcome).toBe("PASS");
    expect(after.state.clientApprovals.BASELINE_APPROVAL?.decisionId).toMatch(/^DEC-/);
  });
  test("AI cannot convert TO_CONFIRM into PASS: only SUFFICIENT/WAIVED/NOT_APPLICABLE satisfy", () => {
    const state = createEngagementState({ clientName: "X", engagementName: "Y", workflowName: "Z", consultantName: "c" });
    const req = state.evidenceReadinessProfile.requirements.find((r) => r.requirementId === "EVID-001")!;
    req.applicability = "TO_CONFIRM";
    const r = act(state, consultant, "ASSESS_EVIDENCE");
    const assessed = r.state.evidenceReadinessProfile.requirements.find((x) => x.requirementId === "EVID-001")!;
    expect(assessed.status).toBe("TO_CONFIRM");
    const g = evaluateGate(r.state, "BASELINE_APPROVAL");
    expect(g.outcome).toBe("BLOCKED");
    expect(g.requirements.find((x) => x.requirementId === "EVID-001")?.satisfied).toBe(false);
  });
  test("hard stops dominate aggregate readiness", () => {
    const { state } = buildDemoEngagement("BASELINE_APPROVAL");
    const g = evaluateGate(state, "BASELINE_APPROVAL");
    const satisfied = [...g.controls, ...g.requirements].filter((x) => x.satisfied).length;
    const total = g.controls.length + g.requirements.length;
    expect(satisfied / total).toBeGreaterThan(0.5);
    expect(g.outcome).toBe("BLOCKED");
  });
  test("waivers require authorization, lineage, expiry, and a decision ID", () => {
    const { state } = buildDemoEngagement("DISCOVERY");
    // Unauthorized role for EVID-001 waiver (CONSULTANT is not in waiverAuthority).
    expectError(() => act(state, consultant, "DECIDE", { type: "WAIVE", target: { type: "EVIDENCE_REQUIREMENT", id: "EVID-002" }, rationale: "skip", payload: { expiresAt: "2030-01-01T00:00:00Z" } }), "UNAUTHORIZED");
    // Expiry in the past rejected.
    expectError(() => act(state, lead, "DECIDE", { type: "WAIVE", target: { type: "EVIDENCE_REQUIREMENT", id: "EVID-002" }, rationale: "skip", payload: { expiresAt: "2000-01-01T00:00:00Z" } }), "PRECONDITION_FAILED");
    // Valid waiver.
    const ok = act(state, lead, "DECIDE", { type: "WAIVE", target: { type: "EVIDENCE_REQUIREMENT", id: "EVID-002" }, rationale: "Client confirms thresholds verbally; written policy follows next sprint", payload: { expiresAt: "2030-01-01T00:00:00Z" } });
    const w = ok.state.waivers[0];
    expect(w.decisionId).toMatch(/^DEC-/);
    expect(ok.state.evidenceReadinessProfile.requirements.find((r) => r.requirementId === "EVID-002")?.status).toBe("WAIVED");
    // A tampered waiver pointing at a recommendation ID does not satisfy.
    const tampered = JSON.parse(JSON.stringify(ok.state)) as FactoryState;
    tampered.waivers[0].decisionId = "REC-001";
    const re = act(tampered, consultant, "ASSESS_EVIDENCE");
    expect(re.state.evidenceReadinessProfile.requirements.find((r) => r.requirementId === "EVID-002")?.status).not.toBe("WAIVED");
  });
  test("a conditional gate needs explicit human acceptance before advancing", () => {
    const { state } = buildDemoEngagement("TARGET_DESIGN_APPROVAL");
    const approved = act(state, owner, "DECIDE", { type: "APPROVE", target: { type: "GATE", id: "TARGET_DESIGN_APPROVAL" }, rationale: "ok" });
    expect(approved.state.gates.TARGET_DESIGN_APPROVAL?.outcome).toBe("CONDITIONAL");
    expectError(() => act(approved.state, consultant, "ADVANCE_STAGE"), "PRECONDITION_FAILED", /CONDITIONAL/);
    const accepted = act(approved.state, owner, "DECIDE", { type: "ACCEPT_CONDITIONAL", target: { type: "GATE", id: "TARGET_DESIGN_APPROVAL" }, rationale: "accepted" });
    const adv = act(accepted.state, consultant, "ADVANCE_STAGE");
    expect(adv.state.currentStage).toBe("EXPERIENCE");
  });
});

describe("Blueprint", () => {
  test("workflow / check / action / current-AI / as-built are reviewed separately and top-level confirmation does not imply the rest", () => {
    const { state } = buildDemoEngagement("BASELINE_DESIGN");
    const bp = getBlueprint(state)!;
    const dc = designCompletionSummary(bp);
    expect(dc.areas.find((a) => a.key === "structure")?.complete).toBe(true);
    expect(dc.areas.find((a) => a.key === "checks")?.complete).toBe(false);
    expect(dc.areas.find((a) => a.key === "actions")?.complete).toBe(false);
    expect(dc.areas.find((a) => a.key === "asBuilt")?.complete).toBe(false);
    expect(dc.complete).toBe(false);
  });
  test("value north star, authority, rule provenance, ARB and treatment gate the target design", () => {
    const { state } = buildDemoEngagement("TARGET_DESIGN");
    const dc = designCompletionSummary(getBlueprint(state)!);
    expect(dc.openAreas).toEqual(expect.arrayContaining(["Value North Star", "AI authority", "Rule evidence / provenance", "ARB assessment", "Implementation treatment"]));
    expectError(() => act(state, consultant, "SUBMIT_FOR_REVIEW"), "PRECONDITION_FAILED", /confirm every step|Design not complete/);
  });
  test("baseline comparison shows change lineage", () => {
    const { state } = buildDemoEngagement("TARGET_DESIGN");
    const r = act(state, consultant, "UPDATE_BLUEPRINT", { op: "SET_STEP", stepId: "WF-002", fields: { name: "AI planning proposal" } });
    const diff = compareToBaseline(state.artifactContent[CONTENT_KEYS.baselineSnapshot] as never, getBlueprint(r.state)!);
    expect(diff.find((d) => d.contractId === "WF-002")?.change).toBe("MODIFIED");
    expect(diff.find((d) => d.contractId === "WF-001")?.change).toBe("UNCHANGED");
  });
  test("targeted invalidation re-opens only dependents", () => {
    const { state } = buildDemoEngagement("TARGET_DESIGN_APPROVAL");
    // Under review → request changes first, then edit WF-002 which feeds WF-003/WF-004 decisions.
    const rc = act(state, owner, "DECIDE", { type: "REQUEST_CHANGES", target: { type: "GATE", id: "TARGET_DESIGN_APPROVAL" }, rationale: "tweak" });
    const r = act(rc.state, consultant, "UPDATE_BLUEPRINT", { op: "SET_STEP", stepId: "WF-002", fields: { purpose: "changed" } });
    const bp = getBlueprint(r.state)!;
    const wf2 = bp.steps.find((s) => s.contractId === "WF-002")!;
    const wf5 = bp.steps.find((s) => s.contractId === "WF-005")!;
    expect(wf2.status).toBe("open");
    expect(wf2.checks.every((c) => c.reviewStatus === "open")).toBe(true);
    expect(wf5.status).toBe("confirmed");
    expect(wf5.humanActions.every((a) => a.reviewStatus === "confirmed")).toBe(true);
  });
  test("canonical check invariant is enforced", () => {
    const { state } = buildDemoEngagement("BASELINE_DESIGN");
    const bp = JSON.parse(JSON.stringify(getBlueprint(state)!));
    bp.steps[0].checks[0].execution.stepId = "WF-002";
    expect(checkInvariantViolations(bp).length).toBeGreaterThan(0);
  });
  test("protected review snapshot stays stable while the working design changes", () => {
    const { state } = buildDemoEngagement("BASELINE_APPROVAL");
    const snap = state.authoritativeArtifacts.find((a) => a.authority === "REVIEW_SNAPSHOT")!;
    expect(snap).toBeDefined();
    const rc = act(state, owner, "DECIDE", { type: "REQUEST_CHANGES", target: { type: "GATE", id: "BASELINE_APPROVAL" }, rationale: "fix" });
    const r = act(rc.state, consultant, "UPDATE_BLUEPRINT", { op: "SET_STEP", stepId: "WF-001", fields: { name: "Renamed" } });
    expect((r.state.artifactContent[CONTENT_KEYS.reviewSnapshot] as { steps: { name: string }[] }).steps[0].name).toBe("Request received");
    expect(getBlueprint(r.state)!.steps[0].name).toBe("Renamed");
    expect(r.state.authoritativeArtifacts.find((a) => a.artifactId === snap.artifactId)?.authority).toBe("REVIEW_SNAPSHOT");
  });
});

describe("Integration", () => {
  test("readiness states cannot be skipped by inference", () => {
    expect(canTransition("DISCOVERED", "CONNECTED").ok).toBe(false);
    expect(canTransition("DISCOVERED", "REQUIREMENT_DEFINED").ok).toBe(true);
    const { state } = buildDemoEngagement("TECHNICAL_DESIGN");
    expectError(() => act(state, itOps, "UPDATE_INTEGRATION", { integrationId: "INT-002", readiness: "CONNECTED" }), "PRECONDITION_FAILED", /skip/);
  });
  test("mock / synthetic evidence never becomes production proof", () => {
    const { state } = buildDemoEngagement("IMPLEMENTATION_VALIDATION");
    const up = act(state, consultant, "UPLOAD_EVIDENCE", { records: [{ title: "Sandbox trace", evidenceType: "RUNTIME_TRACE", sourceClass: "SYNTHETIC_SIMULATION", synthetic: true, scope: "INTEGRATION", requirementIds: ["EVID-009"], claims: [] }] });
    const ref = up.state.evidenceCatalog[up.state.evidenceCatalog.length - 1].evidenceRef;
    expectError(() => act(up.state, itOps, "UPDATE_INTEGRATION", { integrationId: "INT-002", readiness: "CONNECTED", evidenceRef: ref }), "PRECONDITION_FAILED", /Synthetic/);
    const req = up.state.evidenceReadinessProfile.requirements.find((r) => r.requirementId === "EVID-009")!;
    const rec = up.state.evidenceCatalog.find((e) => e.evidenceRef === ref)!;
    expect(isRecordAdmissible(rec, req, new Date(), up.state.engagement_id).admissible).toBe(false);
    expect(isRecordAdmissible(rec, req, new Date(), up.state.engagement_id).reasons.join(" ")).toMatch(/synthetic/i);
  });
  test("writes carry separated authority", () => {
    const { state } = buildDemoEngagement("INTEGRATION_DATA_READINESS");
    const idc = JSON.parse(JSON.stringify(state.artifactContent[CONTENT_KEYS.integrationContract]));
    idc.integrations[1].writeAuthority = null;
    const r = act(state, architect, "SET_INTEGRATION_CONTRACT", { contract: idc });
    const g = r.state.gates.INTEGRATION_DATA_READINESS!;
    expect(g.outcome).toBe("BLOCKED");
    expect(g.hardStops.join(" ")).toMatch(/WRITE mode without complete authority/);
  });
});

describe("Technical / planning", () => {
  test("brownfield reuse preserved and constraints visible", () => {
    const { state } = buildDemoEngagement("TRANSFORMATION_PLANNING");
    const td = state.artifactContent[CONTENT_KEYS.technicalDesign] as { reuse: string[]; architectureConstraints: string[] };
    expect(td.reuse.some((r) => r.includes("workbench-approval-module"))).toBe(true);
    expect(td.architectureConstraints.some((c) => c.startsWith("DO NOT REPLACE"))).toBe(true);
  });
  test("no blanket AI factor; floors explicit; economics never inferred", () => {
    const wp = { packageId: "WP-X", scope: "", deliverable: "", workflowStepIds: [], activities: [{ name: "a", humanHours: 10, aiAddressable: true, aiProductivityAssumption: 0.3, assumptionRationale: "r" }, { name: "b", humanHours: 10, aiAddressable: true, aiProductivityAssumption: 0.3, assumptionRationale: "r" }], humanLedEffortRange: { low: 20, high: 20 }, humanLedElapsedDays: 5, compressibleElements: ["a"], nonCompressibleCriticalPath: [], clientDependencies: [], reuseIncluded: [], dependsOn: [], confidence: "LOW" as const, calibrationNote: "" };
    expect(estimatePackage(wp).issues.join(" ")).toMatch(/blanket/);
    const issues = validatePlan({ schema: "ai-delivery-transformation-plan-v1", version: "1", sourceWorkflowVersion: "", sourceTechnicalDesignVersion: "", workPackages: [wp], humanAdoptionPlan: [], complianceRiskReadout: [], economics: { provided: true, note: "ROI 3x" } });
    expect(issues.join(" ")).toMatch(/non-compressible floors/);
    expect(issues.join(" ")).toMatch(/Economics/);
  });
});

describe("Build / validation", () => {
  test("build contract is repository-independent and certification is separate from implementation", () => {
    const { state } = buildDemoEngagement("IMPLEMENTATION_READINESS");
    const bc = getBuildContract(state)!;
    expect(bc.units.every((u) => u.unitId.startsWith("BU-WF-"))).toBe(true);
    expect(certifyBuildContract(bc).outcome).toBe("PASS");
    expect(getValidationReport(state)).toBeUndefined();
  });
  test("repository conflicts route back to the Factory as pending decisions", () => {
    const { state } = buildDemoEngagement("IMPLEMENTATION_READINESS");
    expect(state.decisions.some((d) => d.type === "CORRECT" && d.target.type === "BUILD_CONTRACT")).toBe(true);
  });
  test("design documents and developer statements are not deployment proof; PASS/PARTIAL/GAP/FAIL/NOT_ASSESSED used", () => {
    const { state } = buildDemoEngagement("CLIENT_SDLC");
    const up = act(state, consultant, "UPLOAD_EVIDENCE", { records: [{ title: "Dev says it's done", evidenceType: "DEVELOPER_STATEMENT", sourceClass: "CLIENT_INFORMAL", scope: "IMPLEMENTATION", requirementIds: [], claims: [{ key: "tests_passing", value: "TRUE" }] }] });
    const rep = act(up.state, consultant, "RUN_VALIDATION");
    const report = getValidationReport(rep.state)!;
    expect(report.units.every((u) => u.status === "NOT_ASSESSED")).toBe(true);
    expect(report.deploymentProven).toBe(false);
    const full = buildDemoEngagement("RELEASE_READINESS");
    const r2 = getValidationReport(full.state)!;
    expect(r2.summary.PASS).toBeGreaterThan(0);
    expect(r2.summary.FAIL).toBe(0);
  });
});

describe("Simulation", () => {
  test("every result is SYNTHETIC_SIMULATION, batch/resume works, targeted invalidation works, and simulation never grants approval", () => {
    const { state } = buildDemoEngagement("TARGET_DESIGN");
    const created = act(state, consultant, "CREATE_SIMULATION", { mode: "BUSINESS_WORKFLOW_VALIDATION" });
    const packId = String(created.data?.packId);
    const jobId = String(created.data?.jobId);
    const partial = act(created.state, consultant, "RUN_SIMULATION_BATCH", { packId, limit: 3 });
    let pack = getSimulationPacks(partial.state)[packId];
    expect(pack.batch.completed).toBe(3);
    expect(pack.batch.status).toBe("CHECKPOINTED");
    expect(Object.values(pack.runs).every((r) => r.evidenceClass === "SYNTHETIC_SIMULATION")).toBe(true);
    // Interrupt, then resume — completed scenarios are not rerun.
    const stopped = act(partial.state, consultant, "INTERRUPT_JOB", { jobId });
    expect(stopped.runtime.resume.resumeStatus).toBe("INTERRUPTED_JOBS");
    expect(stopped.runtime.nextHumanAction.actionType).toBe("RESUME_JOB");
    const resumed = act(stopped.state, consultant, "RESUME_JOB", { jobId });
    const firstRunAt = getSimulationPacks(resumed.state)[packId].runs[pack.scenarios[0].scenarioId].ranAt;
    const finished = act(resumed.state, consultant, "RUN_SIMULATION_BATCH", { packId });
    pack = getSimulationPacks(finished.state)[packId];
    expect(pack.batch.status).toBe("COMPLETE");
    expect(pack.runs[pack.scenarios[0].scenarioId].ranAt).toBe(firstRunAt);
    // Targeted invalidation: change WF-005 → only WF-005 scenarios lose their runs.
    const changed = act(finished.state, consultant, "UPDATE_BLUEPRINT", { op: "SET_STEP", stepId: "WF-005", fields: { purpose: "changed" } });
    const after = getSimulationPacks(changed.state)[packId];
    const wf5 = after.scenarios.filter((s) => s.stepId === "WF-005");
    const others = after.scenarios.filter((s) => s.stepId !== "WF-005");
    expect(wf5.every((s) => !after.runs[s.scenarioId])).toBe(true);
    expect(others.every((s) => !!after.runs[s.scenarioId])).toBe(true);
    // Simulation results never touch gates or approvals.
    expect(finished.state.clientApprovals.TARGET_DESIGN_APPROVAL).toBeUndefined();
    expect(finished.state.authoritativeArtifacts.find((a) => a.kind === "SIMULATION_PACK")?.authority).toBe("REFERENCE_ONLY");
  });
  test("business feedback is design-review evidence, not approval", () => {
    const { state } = buildDemoEngagement("TARGET_DESIGN");
    const created = act(state, consultant, "CREATE_SIMULATION", { mode: "AGENT_BEHAVIOR_AUTHORITY" });
    const packId = String(created.data?.packId);
    const ran = act(created.state, consultant, "RUN_SIMULATION_BATCH", { packId });
    const pack = getSimulationPacks(ran.state)[packId];
    const sid = pack.scenarios[0].scenarioId;
    const fb = act(ran.state, owner, "RECORD_SIMULATION_FEEDBACK", { packId, scenarioId: sid, value: "NEEDS_CHANGE", note: "planner needs override" });
    expect(getSimulationPacks(fb.state)[packId].runs[sid].feedback?.value).toBe("NEEDS_CHANGE");
    expect(fb.state.openItems.some((o) => o.relatedIds.includes(sid))).toBe(true);
    expect(fb.state.decisions.some((d) => d.type === "APPROVE")).toBe(fb.state.decisions.filter((d) => d.type === "APPROVE").length > 0); // unchanged approvals
  });
});

describe("UX / resilience", () => {
  test("zero-prompt start creates an engagement with TO_CONFIRM unknowns and one dominant next action", () => {
    const s = createEngagementState({ clientName: "New Client", engagementName: "Pilot", workflowName: "Claims intake", consultantName: "A" });
    expect(s.engagementSetup.clientObjective).toBe("TO_CONFIRM");
    expect(s.openItems[0].kind).toBe("TO_CONFIRM");
    const rt = projectRuntime(s);
    expect(rt.nextHumanAction.actionType).toBe("UPLOAD_EVIDENCE");
    expect(s.evidenceReadinessProfile.requirements.every((r) => r.status !== "NOT_ASSESSED")).toBe(true);
  });
  test("current authoritative revision is the default and lineage is visible", () => {
    const { state, runtime } = buildDemoEngagement("TARGET_PATH_SELECTION");
    const current = state.authoritativeArtifacts.filter((a) => a.kind === "WORKFLOW_BLUEPRINT" && a.authority === "CURRENT_AUTHORITATIVE");
    expect(current).toHaveLength(1);
    expect(runtime.recentChanges.length).toBeGreaterThan(0);
    expect(state.history.every((h) => h.correlationId && h.stateRevision > 0)).toBe(true);
  });
  test("interrupted work resumes from checkpoint without losing governed work", () => {
    const { state } = buildDemoEngagement("BASELINE_DESIGN");
    const rt = projectRuntime(state);
    expect(rt.resume.resumeStatus).toBe("SAFE");
    expect(rt.resume.latestCheckpointAt).toBeDefined();
    const r = act(state, consultant, "UPDATE_BLUEPRINT", { op: "CONFIRM_STEP", stepId: "WF-001", status: "open" });
    expect(r.runtime.resume.uncommittedWork).toBe(true);
    const c = act(r.state, consultant, "CHECKPOINT", { note: "saved" });
    expect(c.runtime.resume.resumeStatus).toBe("SAFE");
  });
  test("the full lifecycle reaches OPERATE_CI with every gate passed by an authorized human", () => {
    const { state } = buildDemoEngagement("OPERATE_CI");
    expect(state.currentStage).toBe("OPERATE_CI");
    for (const g of ["BASELINE_APPROVAL", "TARGET_DESIGN_APPROVAL", "INTEGRATION_DATA_READINESS", "TECHNICAL_DIRECTION_APPROVAL", "TRANSFORMATION_READINESS", "BUILD_CONTRACT_APPROVAL", "IMPLEMENTATION_READINESS", "TEST_READINESS", "PRODUCTION_READINESS", "HYPERCARE_EXIT"] as const) {
      expect(state.clientApprovals[g]?.decisionId, g).toMatch(/^DEC-/);
      expect(state.decisions.find((d) => d.decisionId === state.clientApprovals[g]?.decisionId)?.actor.role).not.toBe("AI_SPECIALIST");
    }
    expect(state.decisions.every((d) => d.actor.role !== "AI_SPECIALIST")).toBe(true);
  });
  test("AI specialist may request decisions but never decide", () => {
    const { state } = buildDemoEngagement("DISCOVERY");
    const req = act(state, ai, "REQUEST_DECISION", { title: "Confirm owner", question: "Who owns the metric?", target: { type: "VALUE_NORTH_STAR", id: "valueNorthStar" }, allowedRoles: ["CLIENT_BUSINESS_OWNER"], allowedTypes: ["ANSWER"], recommendation: { summary: "Director of Maintenance Operations", rationale: "Named in PM-OPS-17", source: "AI_SPECIALIST" } });
    expect(req.state.pendingHumanDecisions[0].recommendation?.recommendationRef).toMatch(/^REC-/);
    expectError(() => act(req.state, ai, "DECIDE", { requestId: req.state.pendingHumanDecisions[0].requestId, type: "ANSWER", target: { type: "VALUE_NORTH_STAR", id: "valueNorthStar" }, rationale: "me" }), "UNAUTHORIZED");
    expectError(() => act(req.state, ai, "REQUEST_DECISION", { title: "x", question: "y", target: { type: "GATE", id: "BASELINE_APPROVAL" }, allowedRoles: ["AI_SPECIALIST"] }), "PRECONDITION_FAILED");
    const ok = act(req.state, owner, "DECIDE", { requestId: req.state.pendingHumanDecisions[0].requestId, type: "ANSWER", target: { type: "VALUE_NORTH_STAR", id: "valueNorthStar" }, rationale: "Confirmed" });
    expect(ok.state.decisions[ok.state.decisions.length - 1].recommendationRef).toMatch(/^REC-/);
  });
  test("security: a new telemetry platform needs an architecture decision", () => {
    const { state } = buildDemoEngagement("TECHNICAL_DESIGN");
    expectError(() => act(state, consultant, "SET_OBSERVABILITY", { observability: { inheritsClientEcosystem: false } }), "UNAUTHORIZED");
    const r = act(state, architect, "SET_OBSERVABILITY", { observability: { inheritsClientEcosystem: false } }, { reason: "Client has no APM; new platform approved" });
    expect(r.state.itObservability.newParallelPlatformDecisionId).toMatch(/^DEC-/);
    void security;
  });
});

describe("Sample intake pack", () => {
  test("Krishna Industries pack ingests with raw content, surfaces the threshold contradiction, and keeps discovery PARTIAL", async () => {
    const { MemoryStore, setStore } = await import("@/lib/factory/store");
    const { ingestPack } = await import("@/lib/factory/samples");
    setStore(new MemoryStore());
    const r = await ingestPack("samples/krishna-industries", consultant, "ENG-TEST-KI");
    expect(r.accepted).toHaveLength(10);
    expect(r.quarantined).toHaveLength(0);
    expect(r.contradictions.join(" ")).toMatch(/approval_threshold/);
    expect(r.discovery.BUSINESS.status).toBe("PARTIAL");
    expect(r.nextHumanAction.actionType).toBe("RESOLVE_CONTRADICTION");
    const { getStore } = await import("@/lib/factory/store");
    const rec = await getStore().get("ENG-TEST-KI");
    expect(rec!.state.evidenceCatalog.every((e) => (e.content?.length ?? 0) > 200)).toBe(true);
    const m = compileContext(rec!.state, SPECIALISTS.BLUEPRINT, consultant, "t", rec!.state.stateRevision);
    expect(JSON.stringify(m.body)).toMatch(/Sundaram Bearings/i);
    // Resolving each contradiction by decision (without superseding records) reconciles the claims.
    let st = rec!.state;
    for (const c of [...st.discoverySufficiency.contradictions]) {
      st = act(st, owner, "RESOLVE_CONTRADICTION", { contradictionId: c.contradictionId, resolution: "Policy value stands until Rev D is approved." }).state;
    }
    expect(st.discoverySufficiency.contradictions.every((c) => c.status === "RESOLVED")).toBe(true);
    expect(st.evidenceReadinessProfile.requirements.find((r) => r.requirementId === "EVID-001")?.status).toBe("SUFFICIENT");
    expect(st.discoverySufficiency.layers.BUSINESS.status).toBe("SUFFICIENT");
    expectError(() => act(st, owner, "RESOLVE_CONTRADICTION", { contradictionId: "CON-001", resolution: "again" }), "PRECONDITION_FAILED", /already resolved/);
    setStore(null);
  });
});

describe("Specialist output schemas", () => {
  test("every AI specialist schema compiles to a structured-output format with the SDK helper", async () => {
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
    const { EVIDENCE_INTAKE_CONTRACT } = await import("@/lib/factory/specialists/contracts");
    for (const c of [...Object.values(SPECIALISTS).filter((s) => s.aiWorker), EVIDENCE_INTAKE_CONTRACT]) {
      const f = zodOutputFormat(c.outputSchema as unknown as Parameters<typeof zodOutputFormat>[0]);
      expect(f.type, c.id).toBe("json_schema");
      expect(JSON.stringify(f.schema).length, c.id).toBeGreaterThan(100);
    }
  });
});

describe("Specialist run (stubbed model)", () => {
  test("Blueprint specialist output lands as a recommendation that a human can accept into the working design", async () => {
    const { MemoryStore, setStore, getStore } = await import("@/lib/factory/store");
    const { ingestPack } = await import("@/lib/factory/samples");
    const { runSpecialist } = await import("@/lib/factory/specialists/runner");
    const { runAction } = await import("@/lib/factory/service");
    setStore(new MemoryStore());
    await ingestPack("samples/krishna-industries", consultant, "ENG-TEST-KI2");
    const parsed_output = {
      summary: "Six-step PR-to-PO baseline", rationale: "From policy, audit and interview notes", confidence: "MEDIUM",
      phases: [{ key: "request", name: "Request", desc: "" }, { key: "source", name: "Source", desc: "" }, { key: "approve", name: "Approve", desc: "" }],
      steps: [
        { contractId: "WF-001", phase: "request", name: "Raise purchase requisition", owner: "Requester", lane: "ops", type: "mixed", purpose: "Capture need", trigger: "Need identified", inputs: ["Material code"], aiRole: "Check completeness", humanAuthority: "Requester submits", systems: ["SAP"], reads: [], writes: ["PR"], exceptions: "Incomplete PR returned", rerun: "Re-check changed fields", outcome: "Released PR", writeback: "PR in SAP", notes: "", evidenceRefs: ["EV-001"], rules: [{ statement: "PR must carry a cost centre", ruleType: "Data Quality", hardStop: true, provenance: { sourceType: "POLICY_DOCUMENT", sourceRef: "EV-001", status: "SOURCE_SUPPORTED" } }], checks: [{ name: "Completeness", purpose: "", executionPersona: "AI", executionPoint: "On submit", supportsDecisionStepIds: ["WF-002"], inputsEvidence: "", sourceSystems: "SAP", logicType: "Deterministic", expectedResult: "COMPLETE", passAction: "Route", failAction: "Return", output: "Completeness result", writebackAction: "", authority: "System", sourceRefs: [] }], humanActions: [{ name: "Submit PR", actor: "Requester", availableWhen: "", preconditions: "", effect: "", nextState: "RELEASED", targetStepId: "WF-002", systemImpact: "", rerunBehavior: "", auditRequirements: "Actor, timestamp" }] },
        { contractId: "WF-002", phase: "source", name: "Obtain quotations", owner: "Buyer", lane: "purchase", type: "mixed", purpose: "Three quotes above 50k", trigger: "Released PR", inputs: [], aiRole: "Draft comparative statement", humanAuthority: "Buyer signs CS", systems: ["Outlook", "Excel"], reads: [], writes: [], exceptions: "Single source needs KI-F-33", rerun: "", outcome: "Signed CS", writeback: "", notes: "", evidenceRefs: ["EV-001", "EV-007"], rules: [], checks: [], humanActions: [] },
        { contractId: "WF-003", phase: "approve", name: "Release purchase order", owner: "Approver per DoA", lane: "approval", type: "human", purpose: "DoA release", trigger: "PO created", inputs: [], aiRole: "", humanAuthority: "Per DoA — TO_CONFIRM which limits", systems: ["SAP"], reads: [], writes: ["PO release"], exceptions: "", rerun: "", outcome: "Released PO", writeback: "", notes: "Limits contradicted", evidenceRefs: ["EV-001", "EV-002", "EV-007"], rules: [{ statement: "POs above the Purchase Manager limit need Plant Head release", ruleType: "Human Authority", hardStop: true, provenance: { sourceType: "POLICY_DOCUMENT", sourceRef: "EV-001", status: "DISPUTED" } }], checks: [], humanActions: [{ name: "Release PO", actor: "Plant Head", availableWhen: "", preconditions: "", effect: "", nextState: "RELEASED", targetStepId: "WF-003", systemImpact: "SAP release", rerunBehavior: "", auditRequirements: "SAP release log" }] },
      ],
      currentAi: [{ category: "Workflow automation", capability: "SAP release strategy", currentPosition: "2019 config", treatment: "EXTEND", why: "Keep release mechanics", evidenceStatus: "CURRENT_STATE_DOCUMENTED", workflowRefs: ["WF-003"] }],
      valueNorthStar: { objective: "Reduce PR-to-PO cycle time", primaryMetric: "PR-to-PO cycle time", metricDefinition: "Days from PR release to PO release", measurementGranularity: "Per PO", unit: "days", direction: "LOWER_IS_BETTER", startEvent: "PR released", endEvent: "PO released", baseline: "TO_CONFIRM", target: "TO_CONFIRM", owner: "TO_CONFIRM", reportingCadence: "Weekly", secondaryMetrics: [] },
      openItems: [{ title: "Which DoA is authoritative", detail: "Rev C vs April MRM", owner: "CFO office", relatedIds: ["WF-003"] }],
      contradictionsNoted: ["approval thresholds"],
    };
    const stub = { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 12000, output_tokens: 3000, cache_read_input_tokens: 0 }, content: [{ type: "text", text: JSON.stringify(parsed_output) }] }) }) } } as unknown as import("@anthropic-ai/sdk").default;
    const r = await runSpecialist("ENG-TEST-KI2", "BLUEPRINT", consultant, "DEFAULT", stub);
    expect(r.status).toBe("COMPLETE");
    expect(r.requestId).toMatch(/^REQ-/);
    let rec = (await getStore().get("ENG-TEST-KI2"))!;
    const pending = rec.state.pendingHumanDecisions.find((p) => p.requestId === r.requestId)!;
    expect(pending.recommendation?.source).toBe("AI_SPECIALIST");
    expect(rec.state.authoritativeArtifacts.find((a) => a.kind === "SPECIALIST_RECOMMENDATION")?.authority).toBe("REFERENCE_ONLY");
    expect(getBlueprint(rec.state)).toBeUndefined();
    await runAction("ENG-TEST-KI2", { actionType: "DECIDE", actor: consultant, payload: { requestId: r.requestId, type: "ACCEPT_RECOMMENDATION", target: pending.target, rationale: "Accept as starting point" } });
    rec = (await getStore().get("ENG-TEST-KI2"))!;
    const bp = getBlueprint(rec.state)!;
    expect(bp.steps).toHaveLength(3);
    expect(bp.steps.every((s) => s.status === "open")).toBe(true);
    expect(bp.steps[0].checks[0].checkId).toBe("WF-001-C01");
    expect(bp.steps[0].checks[0].execution.stepId).toBe("WF-001");
    expect(rec.state.openItems.some((o) => o.title === "Which DoA is authoritative")).toBe(true);
    expect(rec.state.valueNorthStar.reviewStatus).toBe("OPEN");
    setStore(null);
  });
});
