import Link from "next/link";
import { notFound } from "next/navigation";
import { NextActionCard } from "@/components/next-action";
import { Badge, KV, Note, Panel, Stat, StatusBadge, fmtDate } from "@/components/ui";
import { valueMetricReady } from "@/lib/factory/blueprint";
import { STAGE_LABELS } from "@/lib/factory/lifecycle";
import { getStore } from "@/lib/factory/store";
import { OverviewActions } from "./overview-actions";

export const dynamic = "force-dynamic";

export default async function Workspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state, runtime } = rec;
  const base = `/engagements/${id}`;
  const gate = runtime.currentGate;
  const pending = state.pendingHumanDecisions.filter((p) => p.status === "PENDING");
  const toConfirm = state.openItems.filter((o) => o.status === "OPEN" && o.kind === "TO_CONFIRM");
  const blockers = state.openItems.filter((o) => o.status === "OPEN" && o.kind === "BLOCKER");
  const er = runtime.evidenceReadiness;
  return (
    <>
      <div className="hero">
        <NextActionCard action={runtime.nextHumanAction} stageLabel={STAGE_LABELS[state.currentStage]} />
        <div className="stack">
          <Stat label="Resume readiness" value={runtime.resume.resumeStatus.replaceAll("_", " ")} tone={runtime.resume.resumeStatus === "SAFE" ? "green" : "amber"} sub={runtime.resume.latestCheckpointAt ? `Latest checkpoint ${fmtDate(runtime.resume.latestCheckpointAt)} · rev ${state.checkpoints[state.checkpoints.length - 1]?.stateRevision ?? "—"}` : "No checkpoint yet"} />
          <Stat label="Current gate" value={gate ? gate.outcome : "—"} tone={gate ? (gate.outcome === "PASS" ? "green" : gate.outcome === "CONDITIONAL" ? "amber" : "red") : ""} sub={gate ? `${gate.gateId.replaceAll("_", " ")} · ${gate.blockers.length} open item(s)` : "No gate governs this stage"} />
        </div>
      </div>

      <div className="grid grid-4 section">
        <Stat label="Value North Star" value={<span style={{ fontSize: 15 }}>{state.valueNorthStar.primaryMetric}</span>} sub={<StatusBadge value={valueMetricReady(state.valueNorthStar) ? "CONFIRMED" : state.valueNorthStar.reviewStatus} />} />
        <Stat label="Open decisions" value={pending.length} sub="Pending human decisions" tone={pending.length ? "amber" : ""} />
        <Stat label="Blocking evidence open" value={er.blockingOpen} sub={`${er.sufficient} sufficient · ${er.partial} partial · ${er.required} required · ${er.toConfirm} to confirm`} tone={er.blockingOpen ? "amber" : "green"} />
        <Stat label="Blockers" value={runtime.blockers.length} sub={blockers.length ? blockers[0].title : "From gate hard stops and open BLOCKER items"} tone={runtime.blockers.length ? "red" : "green"} />
      </div>

      <div className="grid grid-main section">
        <div className="stack">
          <Panel label="Deterministic control outcome" right={gate ? <StatusBadge value={gate.outcome} /> : null}>
            {gate ? (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Control / requirement</th>
                      <th>Materiality</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(state.gates[gate.gateId]?.controls ?? []).map((c) => (
                      <tr key={c.controlId}>
                        <td>
                          <b>{c.description}</b>
                          <div className="small muted">{c.detail}</div>
                        </td>
                        <td>
                          <Badge>{c.materiality}</Badge>
                        </td>
                        <td>
                          <StatusBadge value={c.satisfied ? "OK" : c.materiality === "BLOCKING" ? "BLOCKED" : "CONDITIONAL"} />
                        </td>
                      </tr>
                    ))}
                    {(state.gates[gate.gateId]?.requirements ?? []).map((r) => (
                      <tr key={r.requirementId}>
                        <td>
                          <b>{r.requirementId}</b> <span className="small">{r.detail}</span>
                        </td>
                        <td>
                          <Badge>{r.materiality}</Badge>
                        </td>
                        <td>
                          <StatusBadge value={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="small muted" style={{ marginTop: 8 }}>
                  Evaluated at revision {state.gates[gate.gateId]?.evaluatedAtStateRevision} · this outcome is computed from recorded objects only; AI narrative never changes it.
                </div>
              </>
            ) : (
              <p className="small">This stage advances on a human action, not a gate. {runtime.nextHumanAction.detail}</p>
            )}
          </Panel>

          <Panel label="Decision inbox" right={<Link href={`${base}/decisions`}>Open</Link>}>
            {pending.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Decision</th>
                    <th>AI recommendation</th>
                    <th>Authorized</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.slice(0, 5).map((p) => (
                    <tr key={p.requestId}>
                      <td>
                        <b>{p.title}</b>
                        <div className="small muted">{p.question}</div>
                      </td>
                      <td className="small">{p.recommendation ? <><Badge tone="purple">AI</Badge> {p.recommendation.summary}</> : <span className="muted">none</span>}</td>
                      <td className="small">{p.allowedRoles.map((r) => r.replaceAll("_", " ").toLowerCase()).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted">No pending decisions.</p>
            )}
          </Panel>

          <Panel label="TO_CONFIRM items" right={<Badge tone={toConfirm.length ? "amber" : "green"}>{toConfirm.length}</Badge>}>
            {toConfirm.length ? (
              <ul className="list">
                {toConfirm.slice(0, 8).map((o) => (
                  <li key={o.itemId}>
                    <b>{o.itemId}</b> {o.title} <span className="muted">· {o.owner}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small muted">Nothing open.</p>
            )}
          </Panel>
        </div>

        <div className="stack">
          <Panel label="Engagement setup">
            <KV
              items={[
                ["Client", state.engagementSetup.clientName],
                ["Workflow", state.engagementSetup.workflowName],
                ["Objective", state.engagementSetup.clientObjective],
                ["Consultant", `${state.engagementSetup.consultantName} (${state.engagementSetup.consultantRole.toLowerCase()})`],
                ["Discovery", <span key="d">{(Object.entries(runtime.discoverySufficiency) as [string, { status: string }][]).map(([k, v]) => <span key={k} style={{ marginRight: 6 }}><StatusBadge value={v.status} /> {k.replaceAll("_", " ").toLowerCase()}</span>)}</span>],
              ]}
            />
          </Panel>
          <Panel label="Artifact authority">
            {state.authoritativeArtifacts.length ? (
              <div className="stack" style={{ gap: 6 }}>
                {[...state.authoritativeArtifacts]
                  .reverse()
                  .slice(0, 10)
                  .map((a) => (
                    <div key={a.artifactId} className="row spread">
                      <div>
                        <b style={{ fontSize: 12.5 }}>{a.title}</b>
                        <div className="small muted">
                          {a.artifactId} · v{a.version} · {a.producedBy.replaceAll("_", " ").toLowerCase()}
                        </div>
                      </div>
                      <StatusBadge value={a.authority} />
                    </div>
                  ))}
              </div>
            ) : (
              <p className="small muted">No artifacts registered yet.</p>
            )}
          </Panel>
          <Panel label="Recent changes" right={<Link href={`${base}/lineage`}>Lineage</Link>}>
            <ul className="list">
              {runtime.recentChanges.slice(0, 6).map((e) => (
                <li key={e.eventId}>
                  <span className="muted">rev {e.stateRevision}</span> {e.summary}
                </li>
              ))}
            </ul>
          </Panel>
          <OverviewActions />
        </div>
      </div>
      {runtime.projection_of_state_revision !== state.stateRevision ? <Note tone="danger">Runtime projection is stale. Governed transitions are stopped until it is regenerated from authoritative state.</Note> : null}
    </>
  );
}
