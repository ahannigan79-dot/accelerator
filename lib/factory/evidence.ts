/**
 * Evidence admissibility and readiness — deterministic.
 *
 * AI may recommend applicability and assemble evidence; only this module
 * decides whether a requirement is satisfied, from recorded objects.
 */

import type { EvidenceRecord, EvidenceRequirement, EvidenceReadinessStatus, FactoryState, DiscoverySufficiency, DiscoverySufficiencyStatus } from "./schema";
import { isWaiverValid } from "./decisions";

export interface AdmissibilityResult {
  admissible: boolean;
  reasons: string[];
}

export function isRecordAdmissible(rec: EvidenceRecord, req: EvidenceRequirement, now: Date, engagementId: string): AdmissibilityResult {
  const reasons: string[] = [];
  if (rec.engagementId !== engagementId) reasons.push("belongs to a different engagement");
  if (rec.authorityStatus !== "CURRENT") reasons.push(`authority status is ${rec.authorityStatus}`);
  if (rec.supersededBy) reasons.push(`superseded by ${rec.supersededBy}`);
  if (!rec.requirementIds.includes(req.requirementId)) reasons.push("not relevant to this requirement");
  if (!req.allowedEvidenceTypes.includes(rec.evidenceType)) reasons.push(`evidence type ${rec.evidenceType} not permitted`);
  if (!req.allowedSourceClasses.includes(rec.sourceClass)) reasons.push(`source class ${rec.sourceClass} not permitted`);
  if (req.syntheticRule === "REAL_REQUIRED" && (rec.synthetic || rec.sourceClass === "SYNTHETIC_SIMULATION")) reasons.push("synthetic evidence cannot satisfy a real-evidence requirement");
  if (rec.expiresAt && new Date(rec.expiresAt).getTime() < now.getTime()) reasons.push("expired");
  if (req.freshnessDays !== undefined) {
    const ageDays = (now.getTime() - new Date(rec.capturedAt).getTime()) / 86_400_000;
    if (ageDays > req.freshnessDays) reasons.push(`older than freshness window of ${req.freshnessDays} days`);
  }
  if (req.requiredScope !== "ANY" && rec.scope !== req.requiredScope && !rec.scope.startsWith(req.requiredScope)) reasons.push(`scope ${rec.scope} does not cover required scope ${req.requiredScope}`);
  return { admissible: reasons.length === 0, reasons };
}

export function admissibleRecordsFor(state: FactoryState, req: EvidenceRequirement, now = new Date()): EvidenceRecord[] {
  return state.evidenceCatalog.filter((r) => isRecordAdmissible(r, req, now, state.engagement_id).admissible);
}

/** Two admissible records contradict when they carry the same claim key with different values. */
export function contradictingClaims(records: EvidenceRecord[]): { key: string; values: string[]; evidenceRefs: string[] }[] {
  const byKey = new Map<string, Map<string, string[]>>();
  for (const r of records) {
    for (const c of r.claims) {
      const m = byKey.get(c.key) ?? new Map<string, string[]>();
      m.set(c.value, [...(m.get(c.value) ?? []), r.evidenceRef]);
      byKey.set(c.key, m);
    }
  }
  const out: { key: string; values: string[]; evidenceRefs: string[] }[] = [];
  for (const [key, m] of byKey) {
    if (m.size > 1) out.push({ key, values: [...m.keys()], evidenceRefs: [...m.values()].flat() });
  }
  return out;
}

export interface RequirementAssessment {
  status: EvidenceReadinessStatus;
  detail: string;
}

export function assessRequirement(state: FactoryState, req: EvidenceRequirement, now = new Date()): RequirementAssessment {
  // Governed NOT_APPLICABLE (human decision with authority) dominates.
  const na = state.notApplicable.find((n) => n.requirementId === req.requirementId);
  if (na) {
    const dec = state.decisions.find((d) => d.decisionId === na.decisionId && d.type === "NOT_APPLICABLE");
    if (dec && req.waiverAuthority.includes(dec.actor.role)) return { status: "NOT_APPLICABLE", detail: `Governed N/A by ${dec.decisionId} (${dec.actor.role})` };
  }
  // Valid waiver.
  const waiver = state.waivers.find((w) => w.requirementId === req.requirementId);
  if (waiver) {
    const v = isWaiverValid(state, waiver, req, now);
    if (v.valid) return { status: "WAIVED", detail: `Waived by ${waiver.decisionId} until ${waiver.expiresAt.slice(0, 10)}` };
  }
  if (req.applicability === "TO_CONFIRM") return { status: "TO_CONFIRM", detail: "Applicability has not been confirmed by a human" };
  if (req.applicability === "NOT_APPLICABLE") return { status: "TO_CONFIRM", detail: "Marked not applicable without a governed decision — needs a NOT_APPLICABLE decision" };

  const relevant = state.evidenceCatalog.filter((r) => r.requirementIds.includes(req.requirementId));
  const admissible = admissibleRecordsFor(state, req, now);
  const openToConfirm = state.openItems.some((o) => o.status === "OPEN" && o.kind === "TO_CONFIRM" && o.relatedIds.includes(req.requirementId));
  if (admissible.length === 0) {
    if (openToConfirm) return { status: "TO_CONFIRM", detail: "Open TO_CONFIRM item attached; no admissible evidence" };
    if (relevant.length) return { status: "REQUIRED", detail: `${relevant.length} record(s) attached but none admissible` };
    return { status: "REQUIRED", detail: "No evidence recorded" };
  }
  const contradictions = contradictingClaims(admissible);
  if (contradictions.length) return { status: "PARTIAL", detail: `Contradictory claims on ${contradictions.map((c) => c.key).join(", ")} — reconcile before this counts` };
  if (admissible.length < req.minimumEvidenceCount) return { status: "PARTIAL", detail: `${admissible.length} of ${req.minimumEvidenceCount} required admissible record(s)` };
  const claimKeys = new Set(admissible.flatMap((r) => r.claims.map((c) => c.key)));
  const missingClaims = req.requiredClaims.filter((k) => !claimKeys.has(k));
  if (missingClaims.length) return { status: "PARTIAL", detail: `Missing required claims: ${missingClaims.join(", ")}` };
  if (openToConfirm) return { status: "CONDITIONAL", detail: "Evidence sufficient but an open TO_CONFIRM item is still attached" };
  return { status: "SUFFICIENT", detail: `${admissible.length} admissible record(s)` };
}

/** Recompute every requirement status. Pure with respect to inputs other than time. */
export function assessAllRequirements(state: FactoryState, now = new Date()): EvidenceRequirement[] {
  return state.evidenceReadinessProfile.requirements.map((req) => {
    const a = assessRequirement(state, req, now);
    return { ...req, status: a.status, statusDetail: a.detail, lastAssessedAt: now.toISOString() };
  });
}

export const SATISFYING_STATUSES: EvidenceReadinessStatus[] = ["SUFFICIENT", "WAIVED", "NOT_APPLICABLE"];

export function requirementSatisfied(req: EvidenceRequirement): boolean {
  return SATISFYING_STATUSES.includes(req.status);
}

// ---------------------------------------------------------------------------
// Discovery sufficiency
// ---------------------------------------------------------------------------

const LAYER_TYPES = {
  BUSINESS: ["PROCESS_DOCUMENT", "POLICY_DOCUMENT", "INTERVIEW_NOTES", "CLIENT_CONFIRMATION", "PROCESS_MINING"],
  SYSTEM_INTERACTION: ["SYSTEM_EXPORT", "ARCHITECTURE_DOCUMENT", "API_SPECIFICATION", "PROCESS_MINING"],
  IMPLEMENTATION_EVIDENCE: ["REPOSITORY_CODE", "TEST_RESULTS", "RUNTIME_TRACE", "DEPLOYMENT_CONFIG"],
} as const;

export function assessDiscoverySufficiency(state: FactoryState, now = new Date()): DiscoverySufficiency {
  const current = state.evidenceCatalog.filter((r) => r.authorityStatus === "CURRENT" && !r.synthetic);
  const contradictions = state.discoverySufficiency.contradictions;
  const openContradictions = contradictions.filter((c) => c.status === "OPEN");
  const layers = {} as DiscoverySufficiency["layers"];
  for (const layer of ["BUSINESS", "SYSTEM_INTERACTION", "IMPLEMENTATION_EVIDENCE"] as const) {
    const recs = current.filter((r) => (LAYER_TYPES[layer] as readonly string[]).includes(r.evidenceType));
    const authoritative = recs.filter((r) => r.sourceClass === "CLIENT_AUTHORITATIVE" || r.sourceClass === "SYSTEM_OF_RECORD");
    const contradicted = openContradictions.some((c) => c.evidenceRefs.some((ref) => recs.some((r) => r.evidenceRef === ref)));
    let status: DiscoverySufficiencyStatus;
    let detail: string;
    if (recs.length === 0) {
      status = "REQUIRED";
      detail = "No evidence recorded for this layer";
    } else if (contradicted) {
      status = "PARTIAL";
      detail = "Open contradiction in this layer";
    } else if (authoritative.length === 0) {
      status = "TO_CONFIRM";
      detail = `${recs.length} informal record(s); no client-authoritative source yet`;
    } else if (layer === "IMPLEMENTATION_EVIDENCE" && recs.every((r) => r.evidenceType === "PROCESS_MINING")) {
      status = "PARTIAL";
      detail = "Process-mining evidence reconstructs behaviour but does not prove implementation";
    } else {
      status = "SUFFICIENT";
      detail = `${authoritative.length} authoritative record(s)`;
    }
    layers[layer] = { status, detail };
  }
  return { layers, contradictions, assessedAt: now.toISOString() };
}

/** Detect contradictions across the whole catalog (claims on the same key with different values). */
export function detectContradictions(state: FactoryState): { topic: string; evidenceRefs: string[]; description: string }[] {
  const current = state.evidenceCatalog.filter((r) => r.authorityStatus === "CURRENT");
  return contradictingClaims(current).map((c) => ({
    topic: c.key,
    evidenceRefs: c.evidenceRefs,
    description: `Sources disagree on ${c.key}: ${c.values.join(" vs ")}`,
  }));
}
