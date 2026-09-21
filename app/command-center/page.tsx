import Link from "next/link";
import { Badge, Note, Panel, Stat, StatusBadge, fmtDate } from "@/components/ui";
import { getTechnicalDesign, getIntegrationContract } from "@/lib/factory/content";
import { STAGE_LABELS } from "@/lib/factory/lifecycle";
import type { LifecycleStage } from "@/lib/factory/schema";
import { getStore } from "@/lib/factory/store";
import { aiAvailable } from "@/lib/factory/specialists/runner";

export const dynamic = "force-dynamic";

/**
 * Enterprise Command Center — materialized from persisted state and the event stream of
 * every engagement in this store. Never from chat histories. Cross-enterprise context,
 * a shared agent registry and reuse analysis are populated only from what engagements have recorded.
 */
export default async function CommandCenter() {
  const store = getStore();
  const list = await store.list();
  const records = (await Promise.all(list.map((e) => store.get(e.engagementId)))).filter((r): r is NonNullable<typeof r> => !!r);
  const events = await store.events(60);
  const agents = records.flatMap((r) => (getTechnicalDesign(r.state)?.agents ?? []).map((a) => ({ ...a, engagement: r.state.engagementSetup.clientName, engagementId: r.state.engagement_id })));
  const systems = new Map<string, Set<string>>();
  for (const r of records) for (const i of getIntegrationContract(r.state)?.integrations ?? []) systems.set(i.system, new Set([...(systems.get(i.system) ?? []), r.state.engagement_id]));
  const writeExposure = records.flatMap((r) => (getIntegrationContract(r.state)?.integrations ?? []).filter((i) => i.modes.includes("WRITE")).map((i) => ({ ...i, engagementId: r.state.engagement_id })));
  const capabilityDupes = new Map<string, string[]>();
  for (const a of agents) capabilityDupes.set(a.purpose.toLowerCase().slice(0, 40), [...(capabilityDupes.get(a.purpose.toLowerCase().slice(0, 40)) ?? []), a.engagementId]);
  const dupes = [...capabilityDupes.entries()].filter(([, e]) => new Set(e).size > 1);
  const jobs = records.flatMap((r) => r.state.jobs);
  const tokens = jobs.reduce((s, j) => s + j.telemetry.inputTokens + j.telemetry.outputTokens, 0);
  const blocked = records.filter((r) => r.runtime.blockers.length);
  return (
    <>
      <header className="topbar">
        <div className="brand">
          <Link href="/" className="name">AI Delivery Factory</Link>
          <span className="sub">Enterprise Command Center · reads persisted state and events</span>
        </div>
        <div className="chips">{["Operate", "Design", "Simulate", "Govern", "Optimize"].map((m) => <span key={m} className="chip">{m}</span>)}</div>
      </header>
      <main className="container">
        <Note>Command Center views are materialized from the persistent store ({process.env.POSTGRES_URL ? "Postgres" : "file store"}). A single engagement agent never pretends to have this visibility; what you see here is exactly what engagements have recorded through governed actions.</Note>
        <div className="grid grid-4 section">
          <Stat label="Active engagements" value={records.length} sub={`${new Set(records.map((r) => r.state.engagementSetup.clientName)).size} client(s)`} />
          <Stat label="Agents in estate" value={agents.length} sub="Proposed via technical designs" />
          <Stat label="Engagements with blockers" value={blocked.length} tone={blocked.length ? "red" : "green"} sub={blocked.map((r) => r.state.engagement_id).join(", ") || "none"} />
          <Stat label="Reuse / duplicate signals" value={dupes.length} sub={`${writeExposure.length} write-exposed integration(s)`} tone={dupes.length ? "amber" : ""} />
        </div>
        <div className="grid grid-main section">
          <div className="stack">
            <Panel label="Portfolio health">
              <table className="table">
                <thead><tr><th>Engagement</th><th>Stage</th><th>Gate</th><th>Next action</th><th>Resume</th></tr></thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.state.engagement_id}>
                      <td><Link href={`/engagements/${r.state.engagement_id}`}><b>{r.state.engagementSetup.clientName}</b> · {r.state.engagementSetup.engagementName}</Link><div className="small muted">rev {r.state.stateRevision} · {fmtDate(r.state.stateUpdatedAt)}</div></td>
                      <td className="small">{STAGE_LABELS[r.state.currentStage as LifecycleStage]}</td>
                      <td>{r.runtime.currentGate ? <StatusBadge value={r.runtime.currentGate.outcome} /> : <Badge>human action</Badge>}</td>
                      <td className="small">{r.runtime.nextHumanAction.title}</td>
                      <td><StatusBadge value={r.runtime.resume.resumeStatus} /></td>
                    </tr>
                  ))}
                  {!records.length ? <tr><td colSpan={5} className="small muted">No engagements recorded.</td></tr> : null}
                </tbody>
              </table>
            </Panel>
            <Panel label="Enterprise agent estate" right={<Badge>{agents.length}</Badge>}>
              {agents.length ? (
                <table className="table">
                  <thead><tr><th>Agent</th><th>Engagement</th><th>Read / write</th><th>Approvals</th><th>RAI</th><th>Status</th></tr></thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.engagementId + a.agentId}><td><b>{a.agentId}</b> {a.name}<div className="small muted">{a.purpose}</div></td><td className="small">{a.engagement}</td><td className="small">{a.readAuthority} / {a.writeAuthority}</td><td className="small">{a.humanApprovals}</td><td><StatusBadge value={a.responsibleAiClassification} /></td><td><Badge>{a.lifecycleStatus}</Badge> <StatusBadge value={a.reuseDisposition} /></td></tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="small muted">No agents proposed yet; the registry fills from technical designs.</p>}
            </Panel>
            <Panel label="Cross-enterprise signals">
              <div className="stack" style={{ gap: 6 }}>
                {dupes.map(([cap, e]) => <div key={cap} className="stage" style={{ borderColor: "var(--amber)" }}><b>Duplicate capability</b> — {new Set(e).size} engagements design “{cap}…”</div>)}
                {[...systems.entries()].filter(([, e]) => e.size > 1).map(([s, e]) => <div key={s} className="stage" style={{ borderColor: "var(--blue)" }}><b>Shared dependency</b> — {e.size} engagements depend on {s}</div>)}
                {writeExposure.map((w) => <div key={w.engagementId + w.integrationId} className="stage" style={{ borderColor: "var(--purple)" }}><b>Write exposure</b> — {w.integrationId} {w.name} ({w.engagementId}) · AI initiate {String(w.writeAuthority?.aiMayInitiate)} · human {w.writeAuthority?.humanBusinessAuthority ?? "undefined"}</div>)}
                {!dupes.length && !writeExposure.length ? <p className="small muted">No signals.</p> : null}
              </div>
            </Panel>
          </div>
          <div className="stack">
            <Panel label="Factory scale & compute">
              <table className="table"><tbody>
                <tr><td>AI workers</td><td>{aiAvailable() ? <Badge tone="green">online</Badge> : <Badge tone="amber">unavailable</Badge>}</td></tr>
                <tr><td>Jobs</td><td>{jobs.length} · {jobs.filter((j) => j.status === "COMPLETE").length} complete · {jobs.filter((j) => j.status === "INTERRUPTED").length} interrupted · {jobs.filter((j) => j.status === "FAILED").length} failed</td></tr>
                <tr><td>Model calls</td><td>{jobs.reduce((s, j) => s + j.telemetry.modelCalls, 0)}</td></tr>
                <tr><td>Tokens</td><td>{tokens.toLocaleString()}</td></tr>
                <tr><td>Cache read tokens</td><td>{jobs.reduce((s, j) => s + j.telemetry.cacheReadTokens, 0).toLocaleString()}</td></tr>
                <tr><td>Checkpoints</td><td>{records.reduce((s, r) => s + r.state.checkpoints.length, 0)}</td></tr>
                <tr><td>Control</td><td className="small">Batch + checkpoint · targeted invalidation · task-specific context compiler</td></tr>
              </tbody></table>
            </Panel>
            <Panel label="Event stream" right={<Badge>{events.length}</Badge>}>
              <ul className="list">{events.slice(0, 30).map((e) => <li key={e.engagementId + e.eventId}><span className="muted">{e.engagementId} · rev {e.stateRevision}</span> {e.summary}</li>)}</ul>
            </Panel>
          </div>
        </div>
      </main>
    </>
  );
}
