import { notFound } from "next/navigation";
import { Badge, KV, Note, Panel, Stat, StatusBadge } from "@/components/ui";
import { getIntegrationContract, getTechnicalDesign, getBlueprint } from "@/lib/factory/content";
import { integrationBlockers } from "@/lib/factory/integration";
import { getStore } from "@/lib/factory/store";
import { ArchitectureActions, IntegrationRow } from "./forms";

export const dynamic = "force-dynamic";

export default async function Architecture({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const idc = getIntegrationContract(state);
  const td = getTechnicalDesign(state);
  const bp = getBlueprint(state);
  const evidence = state.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT").map((e) => ({ evidenceRef: e.evidenceRef, title: e.title, synthetic: e.synthetic }));
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Technical Specification Studio</h1>
          <div className="small muted">
            Source design contract: {bp ? `${bp.workflowId} v${bp.version}` : "none"} · state rev {state.stateRevision}
          </div>
        </div>
        <div className="chips" style={{ gap: 4 }}>
          <Badge tone="blue">Workflow-linked</Badge>
          <Badge tone="blue">Evidence-linked</Badge>
          <Badge tone={td ? "green" : "amber"}>{td ? `Technical design v${td.version}` : "DRAFT · not implementation authorized"}</Badge>
        </div>
      </div>

      <div className="grid grid-4 section">
        <Stat label="Proposed agents" value={td?.agents.length ?? 0} sub={td?.agents.map((a) => a.name).join(", ") || "Compile the technical design"} />
        <Stat label="Integrations" value={idc?.integrations.length ?? 0} sub={`${(idc?.integrations ?? []).filter((i) => i.requirementStatus === "TO_CONFIRM" || i.physicalRealization.includes("TO_CONFIRM")).length} materially open`} />
        <Stat label="Open decisions" value={td?.openDecisions.length ?? 0} sub={td?.arbNeeds.length ? `${td.arbNeeds.length} ARB need(s)` : "No ARB needs recorded"} tone={td?.openDecisions.length ? "amber" : ""} />
        <Stat label="Observability" value={<span style={{ fontSize: 14 }}>{state.itObservability.inheritsClientEcosystem ? "Inherits client ecosystem" : "Parallel platform"}</span>} sub={state.itObservability.loggingPlatform} tone={state.itObservability.inheritsClientEcosystem ? "green" : "amber"} />
      </div>

      <div className="grid grid-main section">
        <div className="stack">
          <Panel label="Integration contracts" right={idc ? <Badge>v{idc.version}</Badge> : <Badge tone="amber">none</Badge>}>
            {idc ? (
              <>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Integration</th>
                      <th>Four questions</th>
                      <th>Modes / authority</th>
                      <th>Readiness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {idc.integrations.map((i) => (
                      <IntegrationRow key={i.integrationId} integration={i} evidence={evidence} />
                    ))}
                  </tbody>
                </table>
                {(() => {
                  const b = integrationBlockers(idc, "DESIGN");
                  return b.length ? <Note tone="warn">Design-phase blockers: {b.join("; ")}</Note> : <Note>All required integrations client-confirmed with separated write authority.</Note>;
                })()}
              </>
            ) : (
              <p className="small muted">No Integration & Data Contract yet.</p>
            )}
          </Panel>

          <Panel label="Data contracts">
            {idc?.data.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>System of record</th>
                    <th>Read / write authority</th>
                    <th>Sensitivity</th>
                  </tr>
                </thead>
                <tbody>
                  {idc.data.map((d) => (
                    <tr key={d.dataId}>
                      <td>
                        <b>{d.dataId}</b> {d.name} <span className="small muted">({d.workflowStepIds.join(", ")})</span>
                      </td>
                      <td className="small">{d.systemOfRecord}</td>
                      <td className="small">
                        {d.readAuthority} / {d.writeAuthority}
                      </td>
                      <td>
                        <StatusBadge value={d.sensitivity} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted">None.</p>
            )}
          </Panel>

          {td ? (
            <>
              <Panel label="Architecture canvas" right={<Badge>{td.components.length} components</Badge>}>
                <div className="grid grid-4" style={{ gap: 8 }}>
                  {td.components.map((c) => (
                    <div key={c.name + c.stepIds.join()} className="card" style={{ padding: 8, borderTop: `3px solid ${c.kind === "AI_AGENT" ? "var(--purple)" : c.kind === "DETERMINISTIC_CONTROL" ? "var(--accent)" : c.kind === "SYSTEM_OF_RECORD" ? "var(--green)" : "var(--blue)"}` }}>
                      <b style={{ fontSize: 12 }}>{c.name}</b>
                      <div className="small muted">{c.kind.replaceAll("_", " ").toLowerCase()} · {c.stepIds.join(", ")}</div>
                      <div className="small">{c.description}</div>
                      <StatusBadge value={c.treatment} />
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel label="Agent / service contracts">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Read / write</th>
                      <th>Human approvals</th>
                      <th>RAI</th>
                      <th>Disposition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {td.agents.map((a) => (
                      <tr key={a.agentId}>
                        <td>
                          <b>{a.agentId}</b> {a.name}
                          <div className="small muted">{a.purpose}</div>
                        </td>
                        <td className="small">
                          {a.readAuthority} / {a.writeAuthority}
                        </td>
                        <td className="small">{a.humanApprovals}</td>
                        <td>
                          <StatusBadge value={a.responsibleAiClassification} />
                        </td>
                        <td>
                          <StatusBadge value={a.reuseDisposition} /> <Badge>{a.lifecycleStatus}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
              <div className="grid grid-3">
                <Panel label="Reuse">
                  <ul className="list">{td.reuse.length ? td.reuse.map((r) => <li key={r}>{r}</li>) : <li className="muted">none</li>}</ul>
                </Panel>
                <Panel label="Extend / refactor">
                  <ul className="list">{td.extendOrRefactor.length ? td.extendOrRefactor.map((r) => <li key={r}>{r}</li>) : <li className="muted">none</li>}</ul>
                </Panel>
                <Panel label="Net-new">
                  <ul className="list">{td.netNew.length ? td.netNew.map((r) => <li key={r}>{r}</li>) : <li className="muted">none</li>}</ul>
                </Panel>
              </div>
              <Panel label="Open decisions / implementation gates" right={<Badge tone={td.openDecisions.length ? "amber" : "green"}>{td.openDecisions.length}</Badge>}>
                {td.openDecisions.length ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Decision</th>
                        <th>Blocks</th>
                        <th>Owner</th>
                        <th>Resolved</th>
                      </tr>
                    </thead>
                    <tbody>
                      {td.openDecisions.map((d) => {
                        const resolved = state.decisions.find((x) => x.type === "ANSWER" && x.target.type === "DECISION" && x.target.id === d.decisionKey);
                        return (
                          <tr key={d.decisionKey}>
                            <td>
                              <b>{d.decisionKey}</b> {d.topic}
                              <div className="small muted">{d.detail}</div>
                            </td>
                            <td className="small">{d.blocksGate.replaceAll("_", " ").toLowerCase()} {d.arbRequired ? <Badge tone="purple">ARB</Badge> : null}</td>
                            <td className="small">{d.owner}</td>
                            <td>{resolved ? <Badge tone="green">{resolved.decisionId}</Badge> : <ArchitectureActions kind="answer" decisionKey={d.decisionKey} />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="small muted">No open decisions.</p>
                )}
              </Panel>
              <Panel label="Architecture constraints, NFRs, not verified">
                <div className="grid grid-2">
                  <div>
                    <div className="label">Constraints</div>
                    <ul className="list">{td.architectureConstraints.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                  <div>
                    <div className="label">NFRs</div>
                    <ul className="list">{td.nfrs.map((n) => <li key={n.name}><b>{n.name}</b>: {n.target} <StatusBadge value={n.status} /></li>)}</ul>
                    <div className="label" style={{ marginTop: 8 }}>Not verified</div>
                    <ul className="list">{td.notVerified.length ? td.notVerified.map((n) => <li key={n}>{n}</li>) : <li className="muted">nothing outstanding</li>}</ul>
                  </div>
                </div>
                {td.aiEnrichment ? (
                  <div className="note purple" style={{ marginTop: 8 }}>
                    <Badge tone="purple">AI enrichment {td.aiEnrichment.recommendationRef}</Badge>
                    <ul className="list">{td.aiEnrichment.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                  </div>
                ) : null}
              </Panel>
              <Panel label="Technical design summary">
                <pre>{td.summaryMarkdown}</pre>
              </Panel>
            </>
          ) : null}
        </div>

        <div className="stack">
          <ArchitectureActions kind="panel" stage={state.currentStage} hasContract={!!idc} hasDesign={!!td} observability={state.itObservability} />
          <Panel label="Context manifest (technical)">
            <KV
              items={[
                ["state_revision", state.stateRevision],
                ["workflow_version", bp?.version ?? "—"],
                ["integration_contract", idc?.version ?? "—"],
                ["technical_design", td?.version ?? "—"],
                ["enterprise_context", "NONE (single-engagement RC4)"],
                ["sources", state.authoritativeArtifacts.filter((a) => a.authority === "CURRENT_AUTHORITATIVE").map((a) => a.artifactId).join(", ") || "—"],
              ]}
            />
          </Panel>
        </div>
      </div>
    </>
  );
}
