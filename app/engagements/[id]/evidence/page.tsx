import { notFound } from "next/navigation";
import { Badge, Note, Panel, Stat, StatusBadge, fmtDate } from "@/components/ui";
import { getStore } from "@/lib/factory/store";
import { EvidenceForms } from "./forms";

export const dynamic = "force-dynamic";

export default async function Evidence({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const reqs = state.evidenceReadinessProfile.requirements;
  const ds = state.discoverySufficiency;
  const openC = ds.contradictions.filter((c) => c.status === "OPEN");
  return (
    <>
      <div className="row spread">
        <h1>Evidence</h1>
        <span className="small muted">Admissibility and readiness are computed deterministically; AI may classify and recommend, never satisfy.</span>
      </div>
      <div className="grid grid-3 section">
        {(["BUSINESS", "SYSTEM_INTERACTION", "IMPLEMENTATION_EVIDENCE"] as const).map((l) => (
          <Stat key={l} label={`Discovery · ${l.replaceAll("_", " ").toLowerCase()}`} value={<StatusBadge value={ds.layers[l].status} />} sub={ds.layers[l].detail} />
        ))}
      </div>
      {openC.length ? (
        <div className="section">
          <Note tone="warn">
            <b>Open contradictions</b> — contradictory admissible evidence stays PARTIAL until a human reconciles it.
            <ul className="list">
              {openC.map((c) => (
                <li key={c.contradictionId}>
                  <b>{c.contradictionId}</b> {c.description} <span className="muted">({c.evidenceRefs.join(", ")})</span>
                </li>
              ))}
            </ul>
          </Note>
        </div>
      ) : null}

      <div className="grid grid-main section">
        <div className="stack">
          <Panel label="Evidence requirements" right={<Badge>{reqs.length}</Badge>}>
            <table className="table">
              <thead>
                <tr>
                  <th>Requirement</th>
                  <th>Gate</th>
                  <th>Materiality</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.requirementId}>
                    <td>
                      <b>{r.requirementId}</b> {r.description}
                      <div className="small muted">
                        {r.statusDetail} · types: {r.allowedEvidenceTypes.join(", ").toLowerCase()} · scope {r.requiredScope} · {r.syntheticRule === "REAL_REQUIRED" ? "real evidence required" : "synthetic allowed"}
                        {r.freshnessDays ? ` · fresh within ${r.freshnessDays}d` : ""}
                      </div>
                    </td>
                    <td className="small">{r.requiredByGate.replaceAll("_", " ").toLowerCase()}</td>
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
          </Panel>
          <Panel label="Evidence catalog" right={<Badge>{state.evidenceCatalog.length}</Badge>}>
            {state.evidenceCatalog.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th>Type / source</th>
                    <th>Requirements</th>
                    <th>Authority</th>
                  </tr>
                </thead>
                <tbody>
                  {[...state.evidenceCatalog].reverse().map((e) => (
                    <tr key={e.evidenceRef}>
                      <td>
                        <b>{e.evidenceRef}</b> {e.title}
                        <div className="small muted">
                          {e.summary} {e.quarantineReason ? <span style={{ color: "var(--red)" }}>· {e.quarantineReason}</span> : null}
                        </div>
                        {e.claims.length ? (
                          <div className="small">
                            {e.claims.map((c) => (
                              <code key={c.key} style={{ marginRight: 6 }}>
                                {c.key}={c.value}
                              </code>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="small">
                        {e.evidenceType.replaceAll("_", " ").toLowerCase()}
                        <div className="muted">
                          {e.sourceClass.replaceAll("_", " ").toLowerCase()} · {e.environment.toLowerCase()} · {fmtDate(e.capturedAt)}
                        </div>
                        {e.synthetic ? <Badge tone="purple">SYNTHETIC</Badge> : null}
                      </td>
                      <td className="small">{e.requirementIds.join(", ") || <span className="muted">—</span>}</td>
                      <td>
                        <StatusBadge value={e.authorityStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted">No evidence yet. Upload whatever exists; unknowns stay TO_CONFIRM.</p>
            )}
          </Panel>
        </div>
        <div className="stack">
          <EvidenceForms requirements={reqs.map((r) => ({ requirementId: r.requirementId, description: r.description }))} contradictions={openC.map((c) => ({ contradictionId: c.contradictionId, description: c.description, evidenceRefs: c.evidenceRefs }))} />
        </div>
      </div>
    </>
  );
}
