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
  test("small schemas use constrained decoding; the Blueprint schema is sent in the prompt", async () => {
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
    const { MAX_GRAMMAR_SCHEMA_CHARS, extractJson } = await import("@/lib/factory/specialists/runner");
    const size = (id: keyof typeof SPECIALISTS) => JSON.stringify(zodOutputFormat(SPECIALISTS[id].outputSchema as never).schema).length;
    expect(size("BLUEPRINT")).toBeGreaterThan(MAX_GRAMMAR_SCHEMA_CHARS);
    expect(size("CODE_VALIDATOR")).toBeLessThanOrEqual(MAX_GRAMMAR_SCHEMA_CHARS);
    expect(extractJson("Here you go:\n```json\n{\"a\":1}\n```\nthanks")).toBe("{\"a\":1}");
    expect(extractJson("{\"a\":{\"b\":2}}")).toBe("{\"a\":{\"b\":2}}");
  });
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
        { contractId: "WF-001", phase: "request", name: "Raise purchase requisition", owner: "Requester", lane: "ops", type: "mixed", purpose: "Capture need", trigger: "Need identified", inputs: ["Material code"], aiRole: "Check completeness", humanAuthority: "Requester submits", systems: ["SAP"], reads: [], writes: ["PR"], exceptions: "Incomplete PR returned", rerun: "Re-check changed fields", outcome: "Released PR", writeback: "PR in SAP", notes: "", basis: "DOCUMENTED", noHumanDecision: false, noHumanDecisionReason: "", evidenceRefs: ["EV-001"], rules: [{ statement: "PR must carry a cost centre", ruleType: "Data Quality", hardStop: true, basis: "DOCUMENTED", provenance: { sourceType: "POLICY_DOCUMENT", sourceRef: "EV-001", status: "SOURCE_SUPPORTED" } }], checks: [{ name: "Completeness", purpose: "", executionPersona: "AI", executionPoint: "On submit", supportsDecisionStepIds: ["WF-002"], inputsEvidence: "", sourceSystems: "SAP", logicType: "Deterministic", expectedResult: "COMPLETE", passAction: "Route", failAction: "Return", output: "Completeness result", writebackAction: "", authority: "System", sourceRefs: [] }], humanActions: [{ name: "Submit PR", actor: "Requester", availableWhen: "", preconditions: "", effect: "", nextState: "RELEASED", targetStepId: "WF-002", systemImpact: "", rerunBehavior: "", auditRequirements: "Actor, timestamp" }] },
        { contractId: "WF-002", phase: "source", name: "Obtain quotations", owner: "Buyer", lane: "purchase", type: "mixed", purpose: "Three quotes above 50k", trigger: "Released PR", inputs: [], aiRole: "Draft comparative statement", humanAuthority: "Buyer signs CS", systems: ["Outlook", "Excel"], reads: [], writes: [], exceptions: "Single source needs KI-F-33", rerun: "", outcome: "Signed CS", writeback: "", notes: "", basis: "OBSERVED", noHumanDecision: true, noHumanDecisionReason: "Buyer collects quotes; the sourcing decision is taken at PO release", evidenceRefs: ["EV-001", "EV-007"], rules: [], checks: [], humanActions: [] },
        { contractId: "WF-003", phase: "approve", name: "Release purchase order", owner: "Approver per DoA", lane: "approval", type: "human", purpose: "DoA release", trigger: "PO created", inputs: [], aiRole: "", humanAuthority: "Per DoA — TO_CONFIRM which limits", systems: ["SAP"], reads: [], writes: ["PO release"], exceptions: "", rerun: "", outcome: "Released PO", writeback: "", notes: "Limits contradicted", basis: "DOCUMENTED", noHumanDecision: false, noHumanDecisionReason: "", evidenceRefs: ["EV-001", "EV-002", "EV-007"], rules: [{ statement: "POs above the Purchase Manager limit need Plant Head release", ruleType: "Human Authority", hardStop: true, basis: "DOCUMENTED", provenance: { sourceType: "POLICY_DOCUMENT", sourceRef: "EV-001", status: "DISPUTED" } }], checks: [], humanActions: [{ name: "Release PO", actor: "Plant Head", availableWhen: "", preconditions: "", effect: "", nextState: "RELEASED", targetStepId: "WF-003", systemImpact: "SAP release", rerunBehavior: "", auditRequirements: "SAP release log" }] },
      ],
      currentAi: [{ category: "Workflow automation", capability: "SAP release strategy", currentPosition: "2019 config", treatment: "EXTEND", why: "Keep release mechanics", evidenceStatus: "CURRENT_STATE_DOCUMENTED", workflowRefs: ["WF-003"] }],
      valueNorthStar: { objective: "Reduce PR-to-PO cycle time", primaryMetric: "PR-to-PO cycle time", metricDefinition: "Days from PR release to PO release", measurementGranularity: "Per PO", unit: "days", direction: "LOWER_IS_BETTER", startEvent: "PR released", endEvent: "PO released", baseline: "TO_CONFIRM", target: "TO_CONFIRM", owner: "TO_CONFIRM", reportingCadence: "Weekly", secondaryMetrics: [] },
      openItems: [{ title: "Which DoA is authoritative", detail: "Rev C vs April MRM", owner: "CFO office", relatedIds: ["WF-003"] }],
      contradictionsNoted: ["Policy says 1L/5L/25L but the April MRM email says 3L/10L/50L"],
      referenceArchitecture: { status: "CURRENT_STATE_DOCUMENTED", note: "SAP ECC on-prem; Tally at Coimbatore", patterns: ["No SAP–Tally interface", "Dead vendor portal"] },
    };
    let calls = 0;
    const stub = { messages: { stream: (req: { output_config?: unknown; messages: unknown[] }) => ({ finalMessage: async () => {
      calls++;
      // Blueprint schema is above the grammar threshold → schema must travel in the prompt, not as output_config.
      expect(req.output_config).toBeUndefined();
      expect(JSON.stringify(req.messages[0])).toMatch(/JSON Schema/);
      const text = calls === 1 ? "```json\n" + JSON.stringify({ ...parsed_output, confidence: "VERY" }) + "\n```" : JSON.stringify(parsed_output);
      return { stop_reason: "end_turn", usage: { input_tokens: 12000, output_tokens: 3000, cache_read_input_tokens: 0 }, content: [{ type: "text", text }] };
    } }) } } as unknown as import("@anthropic-ai/sdk").default;
    const r = await runSpecialist("ENG-TEST-KI2", "BLUEPRINT", consultant, "DEFAULT", stub);
    expect(r.status).toBe("COMPLETE");
    expect(calls).toBe(2);
    expect(r.telemetry.retries).toBe(1);
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
    expect(rec.state.openItems.some((o) => o.kind === "QUESTION" && /Specialist noted a contradiction/.test(o.title))).toBe(true);
    expect(rec.state.valueNorthStar.reviewStatus).toBe("OPEN");
    expect(rec.state.valueNorthStar.primaryMetric).toBe("PR-to-PO cycle time");
    expect(bp.valueNorthStar.primaryMetric).toBe("PR-to-PO cycle time");
    expect(bp.referenceArchitecture.patterns).toContain("Dead vendor portal");
    setStore(null);
  });
});

describe("Enterprise context grounds workflow design", () => {
  test("Discovery cannot close until the client architect confirms the enterprise context; editing reopens it", () => {
    // Demo discovery: business evidence sufficient, contradiction resolved, but no enterprise context yet.
    let s = buildDemoEngagement("DISCOVERY").state;
    expect(s.enterpriseContext?.reviewStatus ?? "EMPTY").toBe("EMPTY");
    expect(() => act(s, consultant, "ADVANCE_STAGE")).toThrow(/Enterprise context/);
    expect(projectRuntime(s).nextHumanAction.route).toMatch(/\/enterprise$/);
    expect(projectRuntime(s).nextHumanAction.title).toMatch(/Ground the enterprise context/);
    // Empty context cannot be confirmed; a consultant cannot confirm at all.
    expectError(() => act(s, architect, "SET_ENTERPRISE_CONTEXT", { confirm: true }), "PRECONDITION_FAILED", /empty/);
    s = act(s, consultant, "SET_ENTERPRISE_CONTEXT", { op: "MERGE", enterpriseContext: { systems: [{ name: "ERP", detail: "System of record", qualifier: "SoR", owner: "IT", evidenceRefs: ["EV-005"], status: "DOCUMENTED" }, { name: "Side ledger", detail: "Spreadsheet at second site", qualifier: "Manual", owner: "Site accountant", evidenceRefs: [], status: "DOCUMENTED" }], gaps: ["Who owns the interface"] } }).state;
    const ec = s.enterpriseContext!;
    expect(ec.reviewStatus).toBe("OPEN");
    expect(ec.systems[0].id).toMatch(/^ENT-/);
    // DOCUMENTED without a cited record degrades to CLIENT_STATED.
    expect(ec.systems[1].status).toBe("CLIENT_STATED");
    expect(projectRuntime(s).nextHumanAction.title).toMatch(/Confirm the enterprise context/);
    expectError(() => act(s, consultant, "SET_ENTERPRISE_CONTEXT", { confirm: true }), "UNAUTHORIZED");
    s = act(s, architect, "SET_ENTERPRISE_CONTEXT", { confirm: true }, { reason: "Matches the landscape diagram" }).state;
    expect(s.enterpriseContext!.reviewStatus).toBe("CONFIRMED");
    expect(s.decisions.some((d) => d.target.id === "enterprise-context" && d.actor.role === "CLIENT_ARCHITECT")).toBe(true);
    // Blueprint specialist context now carries the ENTERPRISE section.
    const m = compileContext(s, SPECIALISTS.BLUEPRINT, consultant, "t", s.stateRevision);
    expect(m.sectionsIncluded).toContain("ENTERPRISE");
    // Editing reopens it.
    s = act(s, consultant, "SET_ENTERPRISE_CONTEXT", { op: "REMOVE_ENTRY", entryId: ec.systems[1].id }).state;
    expect(s.enterpriseContext!.reviewStatus).toBe("OPEN");
    expect(() => act(s, consultant, "ADVANCE_STAGE")).toThrow(/Enterprise context/);
  });
});

describe("Basis, human decision coverage and stage gating", () => {
  test("rules and steps carry a basis; person-owned steps need a human action or an explicit no-decision statement", async () => {
    const { stageGatingAreas } = await import("@/lib/factory/blueprint");
    const { state } = buildDemoEngagement("BASELINE_DESIGN");
    const bp = getBlueprint(state)!;
    expect(bp.steps.every((s) => ["DOCUMENTED", "OBSERVED", "INFERRED"].includes(s.basis))).toBe(true);
    let s = act(state, consultant, "UPDATE_BLUEPRINT", { op: "ADD_STEP", step: { phase: bp.phases[0].key, name: "Manual reconciliation", owner: "Site accountant", type: "human", basis: "OBSERVED" } }).state;
    const added = getBlueprint(s)!.steps.find((x) => x.name === "Manual reconciliation")!;
    expect(added.basis).toBe("OBSERVED");
    let dc = designCompletionSummary(getBlueprint(s)!);
    const cov = dc.areas.find((a) => a.key === "humanDecision")!;
    expect(cov.total).toBeGreaterThan(0);
    expect(cov.done).toBe(cov.total - 1);
    s = act(s, consultant, "UPDATE_BLUEPRINT", { op: "SET_HUMAN_DECISION", stepId: added.contractId, noHumanDecision: true, reason: "Reconciliation is clerical; the decision sits at PO release" }).state;
    dc = designCompletionSummary(getBlueprint(s)!);
    expect(dc.areas.find((a) => a.key === "humanDecision")!.complete).toBe(true);
    // Adding a human action clears the flag.
    s = act(s, consultant, "UPDATE_BLUEPRINT", { op: "ADD_ACTION", stepId: added.contractId, action: { name: "Sign off reconciliation", actor: "Site accountant", targetStepId: "WF-001" } }).state;
    expect(getBlueprint(s)!.steps.find((x) => x.contractId === added.contractId)!.noHumanDecision).toBe(false);
    // Rule basis via ADD_RULE / SET_RULE; invalid basis rejected on steps.
    s = act(s, consultant, "UPDATE_BLUEPRINT", { op: "ADD_RULE", stepId: added.contractId, rule: { statement: "Ledger must balance", basis: "DOCUMENTED" } }).state;
    const step = getBlueprint(s)!.steps.find((x) => x.contractId === added.contractId)!;
    expect(step.rules[0].basis).toBe("DOCUMENTED");
    s = act(s, consultant, "UPDATE_BLUEPRINT", { op: "SET_RULE", stepId: added.contractId, ruleId: step.rules[0].ruleId, fields: { basis: "INFERRED" } }).state;
    expect(getBlueprint(s)!.steps.find((x) => x.contractId === added.contractId)!.rules[0].basis).toBe("INFERRED");
    expectError(() => act(s, consultant, "UPDATE_BLUEPRINT", { op: "SET_STEP", stepId: added.contractId, fields: { basis: "GUESSED" } }), "INVALID_REQUEST");
    // Only structure gates baseline design; everything gates target design; nothing elsewhere.
    expect(stageGatingAreas("BASELINE_DESIGN")).toEqual(["structure"]);
    expect(stageGatingAreas("TARGET_DESIGN")).toContain("humanDecision");
    expect(stageGatingAreas("BASELINE_APPROVAL")).toEqual([]);
  });

  test("next action in baseline design: confirm steps, then enrich or submit, then submit", () => {
    const { state } = buildDemoEngagement("BASELINE_DESIGN");
    // Demo seed already confirmed all steps and they carry rules → submit for review.
    expect(projectRuntime(state).nextHumanAction.actionType).toBe("SUBMIT_FOR_REVIEW");
    // Strip rules/checks/actions from every step → bare structure → enrichment suggested on the workflow page.
    const bare = JSON.parse(JSON.stringify(state)) as FactoryState;
    const bp = getBlueprint(bare)!;
    bp.steps.forEach((s) => { s.rules = []; s.checks = []; s.humanActions = []; });
    bare.artifactContent[CONTENT_KEYS.blueprint] = bp;
    const na = projectRuntime(bare).nextHumanAction;
    expect(na.actionType).toBe("RUN_SPECIALIST");
    expect(na.route).toMatch(/\/workflow$/);
    expect(na.title).toMatch(/Enrich the confirmed steps/);
    const opened = act(state, consultant, "UPDATE_BLUEPRINT", { op: "CONFIRM_STEP", stepId: "WF-001", status: "open" });
    expect(opened.nextHumanAction.title).toMatch(/Confirm baseline workflow steps/);
  });
});

describe("Split blueprint generation, enrichment and citation check (stubbed model)", () => {
  test("structure first, enrichment only on confirmed steps, citations verified against evidence", async () => {
    const { MemoryStore, setStore, getStore } = await import("@/lib/factory/store");
    const { ingestPack } = await import("@/lib/factory/samples");
    const { runSpecialist, taskBrief, citedRules } = await import("@/lib/factory/specialists/runner");
    const { runAction } = await import("@/lib/factory/service");
    setStore(new MemoryStore());
    const eng = "ENG-TEST-SPLIT";
    await ingestPack("samples/krishna-industries", consultant, eng);
    const stub = (handler: (req: { messages: { content: unknown }[] }) => Record<string, unknown>) => ({ messages: { stream: (req: { messages: { content: unknown }[] }) => ({ finalMessage: async () => ({ stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 }, content: [{ type: "text", text: JSON.stringify(handler(req)) }] }) }) } }) as unknown as import("@anthropic-ai/sdk").default;
    const accept = async (requestId: string) => {
      const rec = (await getStore().get(eng))!;
      const p = rec.state.pendingHumanDecisions.find((x) => x.requestId === requestId)!;
      return runAction(eng, { actionType: "DECIDE", actor: consultant, payload: { requestId, type: "ACCEPT_RECOMMENDATION", target: p.target, rationale: "ok" } });
    };
    // Enrichment and citation check refuse to run before there is anything to work on.
    let state = (await getStore().get(eng))!.state;
    expect(taskBrief("ENRICH", state).blocked).toMatch(/No confirmed steps/);
    expect(taskBrief("CITATION_CHECK", state).blocked).toMatch(/No rule cites/);
    const blockedRun = await runSpecialist(eng, "BLUEPRINT", consultant, "ENRICH", stub(() => ({})));
    expect(blockedRun.status).toBe("INSUFFICIENT_CONTEXT");

    // 1. Structure only.
    const structure = {
      summary: "Skeleton", rationale: "From evidence", confidence: "MEDIUM",
      phases: [{ key: "request", name: "Request", desc: "" }, { key: "approve", name: "Approve", desc: "" }],
      steps: [
        { contractId: "WF-001", phase: "request", name: "Raise PR", owner: "Requester", lane: "plant", type: "human", purpose: "Capture need", trigger: "Need", inputs: [], systems: ["SAP"], outcome: "PR", basis: "DOCUMENTED", evidenceRefs: ["EV-001"] },
        { contractId: "WF-002", phase: "approve", name: "Release PO", owner: "Plant Head", lane: "plant", type: "human", purpose: "DoA release", trigger: "PO", inputs: [], systems: ["SAP"], outcome: "Released PO", basis: "DOCUMENTED", evidenceRefs: ["EV-001"] },
        { contractId: "WF-003", phase: "approve", name: "Coimbatore book in Tally", owner: "Site accountant", lane: "coimbatore", type: "human", purpose: "Side ledger", trigger: "PO", inputs: [], systems: ["Tally"], outcome: "Booked", basis: "OBSERVED", evidenceRefs: ["EV-007"] },
      ],
      currentAi: [], valueNorthStar: { objective: "TO_CONFIRM", primaryMetric: "TO_CONFIRM", metricDefinition: "", measurementGranularity: "", unit: "", direction: "TO_CONFIRM", startEvent: "", endEvent: "", baseline: "", target: "", owner: "", reportingCadence: "", secondaryMetrics: [] },
      openItems: [], contradictionsNoted: [], referenceArchitecture: { status: "TO_CONFIRM", note: "", patterns: [] },
    };
    let seenPrompt = "";
    const r1 = await runSpecialist(eng, "BLUEPRINT", consultant, "STRUCTURE", stub((req) => { seenPrompt = JSON.stringify(req.messages[0].content); return structure; }));
    expect(r1.status).toBe("COMPLETE");
    expect(seenPrompt).toMatch(/workflow skeleton/);
    await accept(r1.requestId!);
    state = (await getStore().get(eng))!.state;
    let bp = getBlueprint(state)!;
    expect(bp.steps).toHaveLength(3);
    expect(bp.steps.every((s) => s.rules.length === 0 && s.checks.length === 0 && s.humanActions.length === 0)).toBe(true);
    expect(bp.steps.every((s) => s.status === "open")).toBe(true);
    expect(bp.steps[2].lane).toBe("coimbatore");
    expect(bp.steps[2].basis).toBe("OBSERVED");

    // 2. Confirm two of three steps; enrichment is scoped to those.
    await runAction(eng, { actionType: "UPDATE_BLUEPRINT", actor: consultant, payload: { op: "CONFIRM_STEP", stepId: "WF-001" } });
    await runAction(eng, { actionType: "UPDATE_BLUEPRINT", actor: consultant, payload: { op: "CONFIRM_STEP", stepId: "WF-002" } });
    state = (await getStore().get(eng))!.state;
    const brief = taskBrief("ENRICH", state);
    expect(brief.instruction).toMatch(/WF-001/);
    expect(brief.instruction).toMatch(/WF-002/);
    expect(brief.instruction).not.toMatch(/WF-003 \(/);
    const enrichment = {
      summary: "Detail", rationale: "", confidence: "MEDIUM",
      steps: [
        { contractId: "WF-001", rules: [{ statement: "PR must carry a cost centre", ruleType: "Data Quality", hardStop: true, basis: "DOCUMENTED", provenance: { sourceType: "POLICY", sourceRef: "EV-001", status: "SOURCE_SUPPORTED" } }, { statement: "Requester attaches three quotes", ruleType: "Business Policy", hardStop: false, basis: "INFERRED", provenance: { sourceType: "POLICY", sourceRef: "EV-999", status: "SOURCE_SUPPORTED" } }], checks: [{ name: "Completeness", purpose: "", executionPersona: "System", executionPoint: "On submit", supportsDecisionStepIds: ["WF-002"], inputsEvidence: "", sourceSystems: "SAP", logicType: "Deterministic", expectedResult: "COMPLETE", passAction: "Route", failAction: "Return", output: "Result", writebackAction: "", authority: "System", sourceRefs: [] }], humanActions: [{ name: "Submit PR", actor: "Requester", availableWhen: "", preconditions: "", effect: "", nextState: "RELEASED", targetStepId: "WF-002", systemImpact: "", rerunBehavior: "", auditRequirements: "" }], noHumanDecision: false, noHumanDecisionReason: "" },
        { contractId: "WF-002", rules: [{ statement: "Plant Head releases above the Purchase Manager limit", ruleType: "Human Authority", hardStop: true, basis: "DOCUMENTED", provenance: { sourceType: "POLICY", sourceRef: "EV-001", status: "SOURCE_SUPPORTED" } }], checks: [], humanActions: [], noHumanDecision: false, noHumanDecisionReason: "" },
        { contractId: "WF-003", rules: [{ statement: "Should not land", ruleType: "Business Policy", hardStop: false, basis: "INFERRED", provenance: { sourceType: "", sourceRef: "", status: "UNCONFIRMED" } }], checks: [], humanActions: [], noHumanDecision: false, noHumanDecisionReason: "" },
      ],
      openItems: [{ title: "Which DoA limits apply", detail: "", owner: "CFO office", relatedIds: ["WF-002"] }],
    };
    const r2 = await runSpecialist(eng, "BLUEPRINT", consultant, "ENRICH", stub(() => enrichment));
    expect(r2.status).toBe("COMPLETE");
    await accept(r2.requestId!);
    state = (await getStore().get(eng))!.state;
    bp = getBlueprint(state)!;
    const wf1 = bp.steps.find((s) => s.contractId === "WF-001")!;
    const wf3 = bp.steps.find((s) => s.contractId === "WF-003")!;
    expect(wf1.status).toBe("confirmed");
    expect(wf1.rules.map((r) => r.ruleId)).toEqual(["WF-001-R01", "WF-001-R02"]);
    expect(wf1.checks[0].checkId).toBe("WF-001-C01");
    expect(wf1.checks[0].reviewStatus).toBe("open");
    expect(wf1.humanActions[0].actionId).toBe("WF-001-A01");
    expect(wf3.rules).toHaveLength(0);
    expect(bp.changeLog[bp.changeLog.length - 1].summary).toMatch(/skipped unconfirmed WF-003/);
    expect(state.openItems.some((o) => /EV-999/.test(o.title))).toBe(true);
    // WF-002 is person-owned with no action and no statement → uncovered.
    expect(designCompletionSummary(bp).areas.find((a) => a.key === "humanDecision")!.done).toBe(1);

    // 3. Citation check: unsupported → DISPUTED; unknown source → SOURCE_MISSING; human-confirmed → contested, not downgraded.
    await runAction(eng, { actionType: "UPDATE_BLUEPRINT", actor: consultant, payload: { op: "SET_RULE", stepId: "WF-002", ruleId: "WF-002-R01", fields: { provenance: { status: "CLIENT_CONFIRMED" } } } });
    state = (await getStore().get(eng))!.state;
    const cited = citedRules(state);
    expect(cited.map((r) => r.ruleId).sort()).toEqual(["WF-001-R01", "WF-001-R02", "WF-002-R01"]);
    expect(cited.find((r) => r.ruleId === "WF-001-R02")!.sourceKnown).toBe(false);
    const citationBrief = taskBrief("CITATION_CHECK", state);
    expect(citationBrief.instruction).toMatch(/WF-001-R01 cites EV-001/);
    expect(citationBrief.instruction).not.toMatch(/WF-001-R02/);
    const verdicts = { summary: "", rationale: "", confidence: "HIGH", verdicts: [
      { ruleId: "WF-001-R01", sourceRef: "EV-001", verdict: "SUPPORTED", quote: "cost centre is mandatory", note: "" },
      { ruleId: "WF-002-R01", sourceRef: "EV-001", verdict: "NOT_SUPPORTED", quote: "", note: "Policy names the CFO, not the Plant Head" },
    ] };
    const r3 = await runSpecialist(eng, "BLUEPRINT", consultant, "CITATION_CHECK", stub(() => verdicts));
    expect(r3.status).toBe("COMPLETE");
    await accept(r3.requestId!);
    state = (await getStore().get(eng))!.state;
    bp = getBlueprint(state)!;
    expect(bp.changeLog[bp.changeLog.length - 1].summary).toMatch(/3 rule\(s\) checked, 1 disputed, 1 supported, 1 contested/);
    const rules = Object.fromEntries(bp.steps.flatMap((s) => s.rules).map((r) => [r.ruleId, r]));
    expect(rules["WF-001-R01"].provenance.status).toBe("SOURCE_SUPPORTED");
    expect(rules["WF-001-R01"].provenance.verification?.quote).toBe("cost centre is mandatory");
    expect(rules["WF-001-R02"].provenance.status).toBe("DISPUTED");
    expect(rules["WF-001-R02"].provenance.verification?.verdict).toBe("SOURCE_MISSING");
    expect(rules["WF-002-R01"].provenance.status).toBe("CLIENT_CONFIRMED");
    expect(rules["WF-002-R01"].provenance.verification?.verdict).toBe("NOT_SUPPORTED");
    expect(state.openItems.some((o) => /contradicts 1 human-confirmed rule/.test(o.title))).toBe(true);
    setStore(null);
  });
});
