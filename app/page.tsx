import Link from "next/link";
import { getStore } from "@/lib/factory/store";
import { STAGE_LABELS } from "@/lib/factory/lifecycle";
import { FACTORY_VERSION, RELEASE_STATUS, type LifecycleStage } from "@/lib/factory/schema";
import { Badge, fmtDate } from "@/components/ui";
import { FrontDoorActions } from "./front-door";
import { aiAvailable } from "@/lib/factory/specialists/runner";

export const dynamic = "force-dynamic";

export default async function Home() {
  const engagements = await getStore().list();
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="name">AI Delivery Factory</span>
          <span className="sub">Governed delivery control plane · v{FACTORY_VERSION} {RELEASE_STATUS}</span>
        </div>
        <div className="chips">
          <span className="chip">AI recommends</span>
          <span className="chip">Controls compute</span>
          <span className="chip">Humans decide</span>
          <span className={`chip${aiAvailable() ? "" : " warn"}`}>{aiAvailable() ? "AI workers online" : "AI workers unavailable"}</span>
        </div>
      </header>
      <main className="front">
        <h1>Start where the evidence is.</h1>
        <p className="lede">Guide one isolated client engagement from evidence intake through baseline, target design, integration and technical readiness, build contract, validation, release and operation — without composing prompts or learning internal skill names.</p>
        <FrontDoorActions hasEngagements={engagements.length > 0} />

        <section className="section">
          <h2>Engagements</h2>
          {engagements.length === 0 ? (
            <div className="note">No engagements yet. Start one, or load the synthetic demo engagement to see the Factory in motion.</div>
          ) : (
            <div className="panel">
              <table className="table">
                <thead>
                  <tr>
                    <th>Engagement</th>
                    <th>Stage</th>
                    <th>Revision</th>
                    <th>Next human action</th>
                    <th>Open</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {engagements.map((e) => (
                    <tr key={e.engagementId}>
                      <td>
                        <Link href={`/engagements/${e.engagementId}`}>
                          <b>{e.clientName}</b> · {e.engagementName}
                        </Link>
                        <div className="small muted">{e.workflowName}</div>
                      </td>
                      <td>{STAGE_LABELS[e.currentStage as LifecycleStage] ?? e.currentStage}</td>
                      <td>
                        <Badge tone="green">rev {e.stateRevision}</Badge>
                      </td>
                      <td>{e.nextAction}</td>
                      <td>
                        {e.blockers ? <Badge tone="red">{e.blockers} blocker(s)</Badge> : null} {e.pendingDecisions ? <Badge tone="amber">{e.pendingDecisions} decision(s)</Badge> : null}
                      </td>
                      <td className="small muted">{fmtDate(e.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="section grid grid-3">
          <div className="card">
            <h3>AI interprets</h3>
            <p className="small">Evidence, gaps, relevance and recommendations come from stateless specialists working from a versioned Context Manifest — never from chat history.</p>
          </div>
          <div className="card">
            <h3>Deterministic controls compute</h3>
            <p className="small">Gate outcomes derive only from recorded control and evidence objects. A hard stop dominates any percentage or aggregate score.</p>
          </div>
          <div className="card">
            <h3>Authorized humans decide</h3>
            <p className="small">Approve, reject, correct, waive and select target paths. A recommendation ID never substitutes for a decision ID.</p>
          </div>
        </section>
        <p className="small muted" style={{ marginTop: 18 }}>
          <Link href="/command-center">Enterprise Command Center</Link> · reads persisted state and events across engagements in this store.
        </p>
      </main>
    </>
  );
}
