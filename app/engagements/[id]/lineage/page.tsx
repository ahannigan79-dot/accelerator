import { notFound } from "next/navigation";
import { Badge, KV, Panel, StatusBadge, fmtDate } from "@/components/ui";
import { getBlueprint } from "@/lib/factory/content";
import { getStore } from "@/lib/factory/store";
import { JobControls } from "./job-controls";

export const dynamic = "force-dynamic";

export default async function Lineage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state, runtime } = rec;
  const bp = getBlueprint(state);
  const r = runtime.resume;
  return (
    <>
      <h1>Lineage, artifacts and resume</h1>
      <div className="grid grid-main section">
        <div className="stack">
          <Panel label="Event history" right={<Badge>{state.history.length}</Badge>}>
            <table className="table">
              <thead><tr><th>Rev</th><th>Event</th><th>Actor</th><th>At</th></tr></thead>
              <tbody>
                {[...state.history].reverse().slice(0, 80).map((e) => (
                  <tr key={e.eventId}>
                    <td className="small muted">{e.stateRevision}</td>
                    <td><Badge>{e.type.replaceAll("_", " ").toLowerCase()}</Badge> {e.summary}<div className="small muted">{e.correlationId}{e.refs.length ? ` · ${e.refs.join(", ")}` : ""}</div></td>
                    <td className="small">{e.actor.role.replaceAll("_", " ").toLowerCase()}</td>
                    <td className="small muted">{fmtDate(e.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          {bp ? (
            <Panel label="Blueprint change log" right={<Badge>v{bp.version}</Badge>}>
              <table className="table">
                <tbody>
                  {[...bp.changeLog].reverse().slice(0, 40).map((c, i) => (
                    <tr key={i}><td className="small muted">rev {c.stateRevision}</td><td>{c.summary}<div className="small muted">{c.by} · {c.affectedIds.join(", ")}</div></td><td className="small muted">{fmtDate(c.at)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : null}
        </div>
        <div className="stack">
          <Panel label="Resume manifest" right={<StatusBadge value={r.resumeStatus} />}>
            <KV items={[
              ["Engagement", r.engagementId],
              ["Stage", `${r.currentStage}${r.currentSubstage ? ` / ${r.currentSubstage}` : ""}`],
              ["State revision", r.stateRevision],
              ["Latest checkpoint", r.latestCheckpointAt ? fmtDate(r.latestCheckpointAt) : "none"],
              ["Uncommitted work", r.uncommittedWork ? "yes" : "no"],
              ["Unresolved decisions", r.unresolvedDecisions.join(", ") || "none"],
              ["TO_CONFIRM", r.toConfirmItems.join(", ") || "none"],
              ["Last completed job", r.lastCompletedJob ?? "none"],
              ["Next resumable unit", r.nextResumableUnit ?? "none"],
              ["Next human action", r.nextHumanAction.title],
            ]} />
          </Panel>
          <Panel label="Artifact registry" right={<Badge>{state.authoritativeArtifacts.length}</Badge>}>
            <table className="table">
              <tbody>
                {[...state.authoritativeArtifacts].reverse().map((a) => (
                  <tr key={a.artifactId}>
                    <td><b>{a.artifactId}</b> {a.title}<div className="small muted">{a.kind.replaceAll("_", " ").toLowerCase()} · v{a.version} · {a.producedBy.replaceAll("_", " ").toLowerCase()}{a.specialistId ? ` (${a.specialistId})` : ""} · rev {a.createdAtStateRevision}{a.supersedes ? ` · supersedes ${a.supersedes}` : ""}{a.upstream.length ? ` · from ${a.upstream.filter((u) => u.artifactId).map((u) => `${u.artifactId}@${u.version}`).join(", ")}` : ""}</div></td>
                    <td><StatusBadge value={a.authority} /><div><StatusBadge value={a.evidenceClass} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel label="Jobs" right={<Badge>{state.jobs.length}</Badge>}>
            {state.jobs.length ? (
              <table className="table"><tbody>
                {[...state.jobs].reverse().map((j) => (
                  <tr key={j.jobId}><td><b>{j.jobId}</b> {j.jobType.replaceAll("_", " ").toLowerCase()}{j.specialistId ? ` · ${j.specialistId}` : ""}<div className="small muted">{j.batch.completed}/{j.batch.total} · src rev {j.sourceStateRevision} · {fmtDate(j.updatedAt)}{j.error ? ` · ${j.error}` : ""}{j.telemetry.modelCalls ? ` · ${j.telemetry.modelCalls} call(s) · ${j.telemetry.inputTokens}/${j.telemetry.outputTokens} tok · ${Math.round(j.telemetry.latencyMs / 1000)} s` : ""}</div><JobControls job={{ jobId: j.jobId, status: j.status, jobType: j.jobType, updatedAt: j.updatedAt }} /></td><td><StatusBadge value={j.status} /></td></tr>
                ))}
              </tbody></table>
            ) : <p className="small muted">No jobs.</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
