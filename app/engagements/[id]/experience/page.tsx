import { notFound } from "next/navigation";
import { Badge, Note, Panel, StatusBadge } from "@/components/ui";
import { CONTENT_KEYS } from "@/lib/factory/content";
import { EXPERIENCE_SUBSTAGES } from "@/lib/factory/schema";
import { getStore } from "@/lib/factory/store";
import { ExperienceForms } from "./forms";

export const dynamic = "force-dynamic";

export default async function Experience({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const x = state.experience;
  const pack = state.artifactContent[CONTENT_KEYS.experiencePack] as { sourceWorkflowVersion: string; screens: { stepId: string; title: string; persona: string; nextAction: string; aiAssist: string }[] } | undefined;
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Experience</h1>
          <div className="small muted">Experience approval validates representation of the approved target design. It does not approve architecture, implementation, integration or release.</div>
        </div>
        <StatusBadge value={x.reviewOutcome} />
      </div>
      <div className="row section">
        {EXPERIENCE_SUBSTAGES.map((s, i) => (
          <span key={s} className={`stage${EXPERIENCE_SUBSTAGES.indexOf(x.substage) > i ? " done" : x.substage === s ? " active" : ""}`}>
            {i + 1} · {s.replace("EXPERIENCE_", "").replaceAll("_", " ").toLowerCase()}
          </span>
        ))}
      </div>
      <div className="grid grid-main section">
        <div className="stack">
          <Panel label="Experience evidence classification" right={<Badge>{x.notes.length}</Badge>}>
            {x.notes.length ? (
              <table className="table">
                <thead><tr><th>Note</th><th>Classification</th><th>Evidence</th><th>Governance</th></tr></thead>
                <tbody>
                  {x.notes.map((n) => (
                    <tr key={n.noteId}>
                      <td><b>{n.noteId}</b> {n.statement}</td>
                      <td><StatusBadge value={n.classification} /></td>
                      <td className="small">{n.evidenceRefs.join(", ") || "—"}</td>
                      <td>{n.affectsGovernance ? <Badge tone="red">routes through governance</Badge> : <Badge tone="green">cosmetic</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted">No experience notes. Classify brand, design-system, baseline, reference, inspiration, avoid and accessibility evidence.</p>
            )}
          </Panel>
          {pack ? (
            <Panel label="Generated experience pack" right={<Badge>design v{pack.sourceWorkflowVersion}</Badge>}>
              <div className="grid grid-3" style={{ gap: 8 }}>
                {pack.screens.map((s) => (
                  <div key={s.stepId} className="card" style={{ padding: 8 }}>
                    <div className="label">{s.stepId} · {s.persona}</div>
                    <b style={{ fontSize: 12.5 }}>{s.title}</b>
                    <div className="small">Next action: {s.nextAction}</div>
                    <div className="small muted">AI assist: {s.aiAssist || "none"}</div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}
          {state.currentStage !== "EXPERIENCE" ? <Note>The engagement is not in the Experience stage; this view is read-only.</Note> : null}
        </div>
        <div className="stack">
          <ExperienceForms notes={x.notes} inStage={state.currentStage === "EXPERIENCE"} substage={x.substage} />
        </div>
      </div>
    </>
  );
}
