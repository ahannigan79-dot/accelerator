import Link from "next/link";
import { notFound } from "next/navigation";
import { ActorPicker, ActorProvider } from "@/components/actor";
import { ActionProvider } from "@/components/action-client";
import { ModeNav } from "@/components/mode-nav";
import { STAGE_LABELS, stageIndex } from "@/lib/factory/lifecycle";
import { LIFECYCLE_STAGES } from "@/lib/factory/schema";
import { getStore } from "@/lib/factory/store";

export const dynamic = "force-dynamic";

export default async function EngagementLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state, runtime } = rec;
  const cur = stageIndex(state.currentStage);
  const stale = runtime.projection_of_state_revision !== state.stateRevision;
  return (
    <ActorProvider>
      <ActionProvider engagementId={id} revision={state.stateRevision}>
        <header className="topbar">
          <div className="brand">
            <Link href="/" className="name">
              AI Delivery Factory
            </Link>
            <span className="sub">
              {state.engagementSetup.clientName} · {state.engagementSetup.engagementName} · <code style={{ color: "#b9ddff" }}>{state.engagement_id}</code>
            </span>
          </div>
          <div className="row">
            <div className="chips">
              <span className="chip">Current authority</span>
              <span className="chip">State rev {state.stateRevision}</span>
              <span className={`chip${stale ? " danger" : ""}`}>{stale ? "Runtime STALE" : `Runtime rev ${runtime.projection_of_state_revision}`}</span>
              <span className={`chip${runtime.resume.resumeStatus === "SAFE" ? "" : " warn"}`}>Resume {runtime.resume.resumeStatus.replaceAll("_", " ").toLowerCase()}</span>
            </div>
            <ActorPicker />
          </div>
        </header>
        <ModeNav id={id} nextRoute={runtime.nextHumanAction.route} nextTitle={runtime.nextHumanAction.title} />
        <div className="shell">
          <aside className="rail">
            <h3>Engagement journey</h3>
            <p className="small muted" style={{ margin: "0 0 8px" }}>Where the engagement is. Stages advance only through governed actions (gates and human decisions), not by clicking.</p>
            {LIFECYCLE_STAGES.map((s, i) => (
              <div key={s} className={`stage${i < cur ? " done" : i === cur ? " active" : ""}`}>
                {i + 1} · {STAGE_LABELS[s]}
              </div>
            ))}
            <h3 style={{ marginTop: 18 }}>Target design mode</h3>
            <div className="small">{state.targetDesignMode.replaceAll("_", " ")}</div>
            <h3 style={{ marginTop: 18 }}>Stage execution</h3>
            <div className="small">{state.activeStageExecution.status.replaceAll("_", " ")}</div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </ActionProvider>
    </ActorProvider>
  );
}
