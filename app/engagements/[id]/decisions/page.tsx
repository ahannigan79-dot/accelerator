import { notFound } from "next/navigation";
import { Badge, KV, Note, Panel, StatusBadge, fmtDate } from "@/components/ui";
import { GATE_APPROVER_ROLES } from "@/lib/factory/decisions";
import { STAGE_EXIT_GATE } from "@/lib/factory/gates";
import { getStore } from "@/lib/factory/store";
import { DecisionForms, GateDecisionForm, PendingDecisionForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function Decisions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const gateId = STAGE_EXIT_GATE[state.currentStage];
  const gate = gateId ? state.gates[gateId] : null;
  const pending = state.pendingHumanDecisions.filter((p) => p.status === "PENDING");
  return (
    <>
      <div className="row spread">
        <h1>Decisions</h1>
        <span className="small muted">AI recommendation · deterministic control outcome · human decision are shown separately and never merged.</span>
      </div>

      <div className="grid grid-main section">
        <div className="stack">
          {gateId ? (
            <Panel label={`Gate ${gateId.replaceAll("_", " ")}`} right={gate ? <StatusBadge value={gate.outcome} /> : <Badge tone="amber">NOT EVALUATED</Badge>}>
              {gate ? (
                <>
                  <div className="small muted" style={{ marginBottom: 8 }}>
                    Evaluated at revision {gate.evaluatedAtStateRevision} (state is {state.stateRevision}). Approvers: {GATE_APPROVER_ROLES[gateId].map((r) => r.replaceAll("_", " ").toLowerCase()).join(", ")}.
                  </div>
                  {gate.hardStops.length ? (
                    <Note tone="danger">
                      <b>Hard stops</b>
                      <ul className="list">
                        {gate.hardStops.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    </Note>
                  ) : null}
                  {gate.conditions.length ? (
                    <Note tone="warn">
                      <b>Conditions</b>
                      <ul className="list">
                        {gate.conditions.map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>
                    </Note>
                  ) : null}
                  {!gate.hardStops.length && !gate.conditions.length ? <Note>All controls and blocking evidence requirements satisfied.</Note> : null}
                </>
              ) : (
                <p className="small">Evaluate the gate to see deterministic control outcomes.</p>
              )}
              <div style={{ marginTop: 10 }}>
                <GateDecisionForm gateId={gateId} approverRoles={GATE_APPROVER_ROLES[gateId]} outcome={gate?.outcome ?? null} />
              </div>
            </Panel>
          ) : (
            <Panel label="Gate">
              <p className="small">The current stage ({state.currentStage.replaceAll("_", " ").toLowerCase()}) advances on a human action rather than a gate.</p>
            </Panel>
          )}

          <Panel label="Pending human decisions" right={<Badge tone={pending.length ? "amber" : "green"}>{pending.length}</Badge>}>
            {pending.length ? (
              <div className="stack">
                {pending.map((p) => (
                  <div key={p.requestId} className="card">
                    <div className="row spread">
                      <h3>
                        {p.requestId} · {p.title}
                      </h3>
                      <Badge>{p.requestedBy === "AI" ? "requested by AI" : "requested by human"}</Badge>
                    </div>
                    <p className="small">{p.question}</p>
                    {p.recommendation ? (
                      <div className="note purple" style={{ marginTop: 8 }}>
                        <Badge tone="purple">AI recommendation {p.recommendation.recommendationRef}</Badge> <b>{p.recommendation.summary}</b>
                        <div className="small">{p.recommendation.rationale}</div>
                        <div className="small muted">
                          {p.recommendation.specialistId ?? p.recommendation.source} · confidence {p.recommendation.confidence ?? "n/a"} · from state rev {p.recommendation.sourceStateRevision}
                        </div>
                      </div>
                    ) : null}
                    <div style={{ marginTop: 8 }}>
                      <PendingDecisionForm request={p} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">No pending decisions.</p>
            )}
          </Panel>

          <DecisionForms requirements={state.evidenceReadinessProfile.requirements.map((r) => ({ requirementId: r.requirementId, description: r.description, status: r.status, waiverAuthority: r.waiverAuthority }))} openItems={state.openItems.filter((o) => o.status === "OPEN").map((o) => ({ itemId: o.itemId, title: o.title }))} currentStage={state.currentStage} targetDesignMode={state.targetDesignMode} />
        </div>

        <div className="stack">
          <Panel label="Decision lineage" right={<Badge>{state.decisions.length}</Badge>}>
            {state.decisions.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Decision</th>
                    <th>By</th>
                    <th>Target</th>
                  </tr>
                </thead>
                <tbody>
                  {[...state.decisions].reverse().slice(0, 25).map((d) => (
                    <tr key={d.decisionId}>
                      <td>
                        <b>{d.decisionId}</b> <StatusBadge value={d.type} />
                        <div className="small muted">{d.rationale}</div>
                        {d.recommendationRef ? (
                          <div className="small">
                            <Badge tone="purple">responds to {d.recommendationRef}</Badge>
                          </div>
                        ) : null}
                      </td>
                      <td className="small">
                        {d.actor.role.replaceAll("_", " ").toLowerCase()}
                        <div className="muted">rev {d.stateRevisionAtDecision} · {fmtDate(d.decidedAt)}</div>
                      </td>
                      <td className="small">
                        {d.target.type} {d.target.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted">No decisions recorded.</p>
            )}
          </Panel>
          <Panel label="Waivers and governed N/A">
            {state.waivers.length || state.notApplicable.length ? (
              <KV items={[...state.waivers.map((w): [string, React.ReactNode] => [w.requirementId, <span key={w.waiverId}><StatusBadge value={w.status} /> by {w.decisionId} ({w.authorizedRole.toLowerCase()}) until {w.expiresAt.slice(0, 10)}</span>]), ...state.notApplicable.map((n): [string, React.ReactNode] => [n.requirementId, <span key={n.decisionId}><Badge tone="blue">N/A</Badge> by {n.decisionId} ({n.authorizedRole.toLowerCase()})</span>])]} />
            ) : (
              <p className="small muted">None.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
