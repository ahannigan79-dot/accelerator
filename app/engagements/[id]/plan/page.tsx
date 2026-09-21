import { notFound } from "next/navigation";
import { Badge, Note, Panel, Stat, StatusBadge } from "@/components/ui";
import { getTransformationPlan } from "@/lib/factory/content";
import { estimatePackage, programTimeline, validatePlan } from "@/lib/factory/planner";
import { getStore } from "@/lib/factory/store";
import { PlanActions } from "./forms";

export const dynamic = "force-dynamic";

export default async function Plan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const plan = getTransformationPlan(state);
  const issues = validatePlan(plan);
  const tl = plan ? programTimeline(plan) : null;
  const est = plan ? plan.workPackages.map(estimatePackage) : [];
  const totals = est.reduce((a, e) => ({ human: a.human + e.humanHours, ai: a.ai + e.aiAdjustedHours }), { human: 0, ai: 0 });
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Transformation Plan</h1>
          <div className="small muted">Estimation by delivery work package · human baseline first · activity-specific AI assumptions · no blanket factor · no economics inferred</div>
        </div>
        {plan ? <Badge>v{plan.version}</Badge> : null}
      </div>
      <div className="grid grid-4 section">
        <Stat label="Work packages" value={plan?.workPackages.length ?? 0} />
        <Stat label="Human-led effort" value={`${totals.human} h`} sub="Sum of activity baselines" />
        <Stat label="AI-adjusted effort" value={`${totals.ai} h`} sub={`Δ ${totals.human - totals.ai} h`} tone="green" />
        <Stat label="Critical path" value={tl ? `${tl.criticalPathDays} d` : "—"} sub={tl ? `overlapped vs ${tl.linearSumDays} d linear` : "Dependency-aware timeline"} />
      </div>
      {plan ? (
        issues.length ? (
          <div className="section">
            <Note tone="warn">
              <b>Plan validation issues</b>
              <ul className="list">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
            </Note>
          </div>
        ) : (
          <div className="section">
            <Note>Plan valid: activity-specific assumptions, non-compressible floors declared, dependency cycle-free, no economics.</Note>
          </div>
        )
      ) : null}
      <div className="grid grid-main section">
        <div className="stack">
          {plan ? (
            plan.workPackages.map((wp) => {
              const e = est.find((x) => x.packageId === wp.packageId)!;
              return (
                <Panel key={wp.packageId} label={`${wp.packageId} · ${wp.scope}`} right={<><Badge>{wp.confidence} confidence</Badge> <Badge tone="blue">depends on {wp.dependsOn.join(", ") || "—"}</Badge></>}>
                  <div className="small" style={{ marginBottom: 6 }}>
                    {wp.deliverable} · steps {wp.workflowStepIds.join(", ")}
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Activity</th>
                        <th>Human h</th>
                        <th>AI-addressable</th>
                        <th>Assumption</th>
                        <th>Floor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wp.activities.map((a) => (
                        <tr key={a.name}>
                          <td>{a.name}</td>
                          <td>{a.humanHours}</td>
                          <td>{a.aiAddressable ? <Badge tone="green">yes</Badge> : <Badge>no</Badge>}</td>
                          <td className="small">
                            {a.aiAddressable ? `${Math.round((a.aiProductivityAssumption ?? 0) * 100)}% — ${a.assumptionRationale ?? "no rationale"}` : "—"}
                          </td>
                          <td>{a.nonCompressibleFloor ? <Badge tone="amber">{a.nonCompressibleFloor.replaceAll("_", " ").toLowerCase()}</Badge> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="grid grid-4" style={{ marginTop: 8, gap: 8 }}>
                    <div className="card" style={{ padding: 8 }}><div className="label">Human-led</div><b>{e.humanHours} h · {e.humanElapsedDays} d</b><div className="small muted">range {wp.humanLedEffortRange.low}–{wp.humanLedEffortRange.high}</div></div>
                    <div className="card" style={{ padding: 8 }}><div className="label">AI-adjusted</div><b>{e.aiAdjustedHours} h · {e.aiAdjustedElapsedDays} d</b><div className="small muted">Δ {e.effortDeltaHours} h · Δ {e.timelineDeltaDays} d</div></div>
                    <div className="card" style={{ padding: 8 }}><div className="label">Non-compressible</div><div className="small">{wp.nonCompressibleCriticalPath.join(", ") || "—"}</div></div>
                    <div className="card" style={{ padding: 8 }}><div className="label">Client dependencies</div><div className="small">{wp.clientDependencies.join(", ") || "—"}</div></div>
                  </div>
                  {e.issues.length ? <div className="small" style={{ color: "var(--amber)", marginTop: 6 }}>{e.issues.join("; ")}</div> : null}
                  <div className="small muted" style={{ marginTop: 6 }}>Reuse included: {wp.reuseIncluded.join(", ") || "none"} · calibration: {wp.calibrationNote}</div>
                </Panel>
              );
            })
          ) : (
            <Note>No Transformation Plan yet. Run the planner specialist or paste a plan.</Note>
          )}
          {plan ? (
            <div className="grid grid-2">
              <Panel label="Human adoption plan"><ul className="list">{plan.humanAdoptionPlan.map((x) => <li key={x}>{x}</li>)}</ul></Panel>
              <Panel label="Compliance / risk readout"><ul className="list">{plan.complianceRiskReadout.map((x) => <li key={x}>{x}</li>)}</ul></Panel>
            </div>
          ) : null}
        </div>
        <div className="stack">
          <PlanActions stage={state.currentStage} />
          {tl ? (
            <Panel label="Program timeline (overlapped)">
              <ol className="list">{tl.order.map((p) => <li key={p}>{p}</li>)}</ol>
              <div className="small muted">Critical path {tl.criticalPathDays} days; linear stitching would be {tl.linearSumDays}.</div>
            </Panel>
          ) : null}
          <Panel label="Economic boundary"><p className="small"><StatusBadge value={plan?.economics.provided ? "BLOCKED" : "OK"} /> {plan?.economics.note ?? "No price, margin, rates, ROI or payback are inferred without authoritative economics and a separate request."}</p></Panel>
        </div>
      </div>
    </>
  );
}
