/**
 * Transformation Planner — work-package estimation contract.
 * Human baseline first; AI adjustments are activity-specific; no blanket factor.
 */

export interface Activity {
  name: string;
  humanHours: number;
  aiAddressable: boolean;
  /** Explicit, activity-specific productivity assumption (0..1 fraction of effort removed). Required when aiAddressable. */
  aiProductivityAssumption?: number;
  assumptionRationale?: string;
  nonCompressibleFloor?: "HUMAN_VERIFICATION" | "EVALUATION" | "PRODUCTION_HARDENING" | "GOVERNANCE" | "CLIENT_DECISION" | "ACCESS_LEAD_TIME" | "UAT_WINDOW" | "APPROVAL_DWELL";
}

export interface WorkPackage {
  packageId: string; // WP-###
  scope: string;
  deliverable: string;
  workflowStepIds: string[];
  activities: Activity[];
  humanLedEffortRange: { low: number; high: number }; // hours
  humanLedElapsedDays: number;
  compressibleElements: string[];
  nonCompressibleCriticalPath: string[];
  clientDependencies: string[];
  reuseIncluded: string[];
  dependsOn: string[]; // other packageIds
  confidence: "LOW" | "MEDIUM" | "HIGH";
  calibrationNote: string;
}

export interface WorkPackageEstimate {
  packageId: string;
  humanHours: number;
  aiAdjustedHours: number;
  effortDeltaHours: number;
  humanElapsedDays: number;
  aiAdjustedElapsedDays: number;
  timelineDeltaDays: number;
  issues: string[];
}

export interface TransformationPlan {
  schema: "ai-delivery-transformation-plan-v1";
  version: string;
  sourceWorkflowVersion: string;
  sourceTechnicalDesignVersion: string;
  workPackages: WorkPackage[];
  humanAdoptionPlan: string[];
  complianceRiskReadout: string[];
  economics: { provided: boolean; note: string };
}

export function estimatePackage(wp: WorkPackage): WorkPackageEstimate {
  const issues: string[] = [];
  let humanHours = 0;
  let aiAdjusted = 0;
  const assumptions = new Set<number>();
  for (const a of wp.activities) {
    humanHours += a.humanHours;
    if (a.aiAddressable) {
      if (typeof a.aiProductivityAssumption !== "number") {
        issues.push(`Activity "${a.name}" is AI-addressable without an explicit productivity assumption`);
        aiAdjusted += a.humanHours;
        continue;
      }
      if (a.nonCompressibleFloor) issues.push(`Activity "${a.name}" is marked as a non-compressible floor (${a.nonCompressibleFloor}) but also AI-addressable`);
      if (!a.assumptionRationale?.trim()) issues.push(`Activity "${a.name}" lacks a rationale for its AI assumption`);
      assumptions.add(a.aiProductivityAssumption);
      aiAdjusted += a.humanHours * (1 - Math.min(Math.max(a.aiProductivityAssumption, 0), 0.95));
    } else {
      aiAdjusted += a.humanHours;
    }
  }
  const addressable = wp.activities.filter((a) => a.aiAddressable);
  if (addressable.length > 1 && assumptions.size === 1) issues.push("One identical percentage applied to every AI-addressable activity — this reads as a blanket AI factor");
  if (wp.activities.length === 0) issues.push("No activity breakdown");
  if (humanHours < wp.humanLedEffortRange.low || humanHours > wp.humanLedEffortRange.high) issues.push(`Activity hours (${humanHours}) fall outside the stated human-led range ${wp.humanLedEffortRange.low}–${wp.humanLedEffortRange.high}`);
  // Elapsed time compresses only through compressible elements; floor at 60% of human elapsed unless justified.
  const compressRatio = wp.compressibleElements.length ? Math.max(0.6, aiAdjusted / Math.max(humanHours, 1)) : 1;
  const aiAdjustedElapsedDays = Math.ceil(wp.humanLedElapsedDays * compressRatio);
  return {
    packageId: wp.packageId,
    humanHours,
    aiAdjustedHours: Math.round(aiAdjusted),
    effortDeltaHours: Math.round(humanHours - aiAdjusted),
    humanElapsedDays: wp.humanLedElapsedDays,
    aiAdjustedElapsedDays,
    timelineDeltaDays: wp.humanLedElapsedDays - aiAdjustedElapsedDays,
    issues,
  };
}

/** Dependency-aware overlapped timeline (critical path in days). */
export function programTimeline(plan: TransformationPlan): { criticalPathDays: number; linearSumDays: number; order: string[]; cycles: string[] } {
  const est = new Map(plan.workPackages.map((wp) => [wp.packageId, estimatePackage(wp)]));
  const finish = new Map<string, number>();
  const order: string[] = [];
  const cycles: string[] = [];
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (finish.has(id)) return finish.get(id)!;
    if (visiting.has(id)) {
      cycles.push(id);
      return 0;
    }
    visiting.add(id);
    const wp = plan.workPackages.find((w) => w.packageId === id);
    if (!wp) return 0;
    const start = Math.max(0, ...wp.dependsOn.map(visit));
    const end = start + (est.get(id)?.aiAdjustedElapsedDays ?? 0);
    finish.set(id, end);
    visiting.delete(id);
    order.push(id);
    return end;
  };
  plan.workPackages.forEach((wp) => visit(wp.packageId));
  return {
    criticalPathDays: Math.max(0, ...finish.values()),
    linearSumDays: [...est.values()].reduce((s, e) => s + e.aiAdjustedElapsedDays, 0),
    order,
    cycles,
  };
}

export function validatePlan(plan: TransformationPlan | undefined): string[] {
  if (!plan) return ["No Transformation Plan registered"];
  const issues: string[] = [];
  if (!plan.workPackages.length) issues.push("Plan has no work packages");
  for (const wp of plan.workPackages) estimatePackage(wp).issues.forEach((i) => issues.push(`${wp.packageId}: ${i}`));
  const tl = programTimeline(plan);
  if (tl.cycles.length) issues.push(`Dependency cycle at ${tl.cycles.join(", ")}`);
  const floors = plan.workPackages.flatMap((wp) => wp.activities.filter((a) => a.nonCompressibleFloor));
  if (!floors.length) issues.push("No non-compressible floors declared (human verification, governance, client decisions, UAT, approval dwell)");
  if (plan.economics.provided) issues.push("Economics present: pricing, margin or ROI must not be inferred without authoritative economics and a separate request");
  return issues;
}
