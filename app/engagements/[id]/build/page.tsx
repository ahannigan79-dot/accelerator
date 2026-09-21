import { notFound } from "next/navigation";
import { Badge, Note, Panel, Stat, StatusBadge } from "@/components/ui";
import { certifyBuildContract } from "@/lib/factory/build";
import { getBuildContract, getRealizationPlan } from "@/lib/factory/content";
import { getStore } from "@/lib/factory/store";
import { BuildActions } from "./forms";

export const dynamic = "force-dynamic";

export default async function Build({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const bc = getBuildContract(state);
  const rp = getRealizationPlan(state);
  const cert = certifyBuildContract(bc);
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Build Contract</h1>
          <div className="small muted">Repository-independent implementation contract for a coding partner. Authority: design semantics → technical design → readiness decisions → repository reality.</div>
        </div>
        {bc ? <Badge>v{bc.version}</Badge> : null}
      </div>
      <div className="grid grid-4 section">
        <Stat label="Build units" value={bc ? bc.units.length + 1 : 0} sub="incl. continuous-improvement unit" />
        <Stat label="Certification" value={<StatusBadge value={cert.outcome} />} sub={cert.findings[0] ?? "Internally valid — implementation not implied"} />
        <Stat label="Realization plan" value={<StatusBadge value={rp ? (rp.conflicts.every((c) => c.status === "RESOLVED") ? "OK" : "OPEN") : "REQUIRED"} />} sub={rp ? `${rp.conflicts.length} conflict(s) returned to Factory` : "Coding partner has not responded"} />
        <Stat label="Unresolved decisions" value={bc ? bc.units.reduce((s, u) => s + u.unresolvedDecisions.length, 0) : 0} sub="Must never be hard-coded" />
      </div>
      <div className="grid grid-main section">
        <div className="stack">
          {bc ? (
            <>
              {cert.findings.length ? <Note tone="danger"><b>Certification findings</b><ul className="list">{cert.findings.map((f) => <li key={f}>{f}</li>)}</ul></Note> : null}
              {[...bc.units, bc.continuousImprovementUnit].map((u) => (
                <Panel key={u.unitId} label={`${u.unitId} · ${u.sourceStepId}`} right={<><StatusBadge value={u.targetTreatment} /> {u.arb.reviewRequired === "REQUIRED" ? <Badge tone="purple">ARB</Badge> : null}</>}>
                  <div className="small" style={{ marginBottom: 6 }}>{u.objective}</div>
                  <div className="grid grid-3" style={{ gap: 8 }}>
                    <div className="card" style={{ padding: 8 }}><div className="label">Reuse</div><div className="small">{u.reuse.join(", ") || "—"}</div><div className="label" style={{ marginTop: 4 }}>Extend / refactor</div><div className="small">{u.extendOrRefactor.join(", ") || "—"}</div><div className="label" style={{ marginTop: 4 }}>Net-new</div><div className="small">{u.netNew.join(", ") || "—"}</div></div>
                    <div className="card" style={{ padding: 8 }}><div className="label">DO NOT REPLACE</div><div className="small">{u.doNotReplace.join(", ") || "—"}</div><div className="label" style={{ marginTop: 4 }}>Constraints</div><ul className="list">{u.architectureConstraints.map((c) => <li key={c}>{c}</li>)}</ul></div>
                    <div className="card" style={{ padding: 8 }}><div className="label">Authority</div><div className="small">{u.authority.autonomyLevel} · approval {u.authority.humanApprovalRequired} · advance {String(u.authority.aiCanAdvance)} · writeback {String(u.authority.aiCanWriteback)}</div><div className="label" style={{ marginTop: 4 }}>Rerun / recovery</div><div className="small">{u.rerunRecovery || "—"}</div></div>
                  </div>
                  <div className="grid grid-2" style={{ marginTop: 8, gap: 8 }}>
                    <div>
                      <div className="label">Rules</div>
                      <ul className="list">{u.rules.map((r) => <li key={r.ruleId}>{r.hardStop ? <Badge tone="red">HARD</Badge> : null} {r.ruleId} {r.statement}</li>)}</ul>
                      <div className="label" style={{ marginTop: 4 }}>Checks executed here</div>
                      <ul className="list">{u.checksExecutedHere.map((c) => <li key={c.checkId}>{c.checkId} {c.name} → {c.expectedResult}</li>)}</ul>
                      <div className="label" style={{ marginTop: 4 }}>Validated outputs consumed here</div>
                      <ul className="list">{u.validatedOutputsConsumedHere.length ? u.validatedOutputsConsumedHere.map((c) => <li key={c.checkId}>{c.checkId} from {c.fromStepId}</li>) : <li className="muted">none</li>}</ul>
                    </div>
                    <div>
                      <div className="label">Human actions / state transitions</div>
                      <ul className="list">{u.humanActions.map((a) => <li key={a.actionId}>{a.actionId} {a.name} ({a.actor}) → {a.nextState}</li>)}</ul>
                      <div className="label" style={{ marginTop: 4 }}>Acceptance criteria</div>
                      <ul className="list">{u.acceptanceCriteria.map((c) => <li key={c}>{c}</li>)}</ul>
                      <div className="label" style={{ marginTop: 4 }}>Tests</div>
                      <ul className="list">{[...u.checkTests, ...u.actionAuditTests].map((c) => <li key={c}>{c}</li>)}</ul>
                    </div>
                  </div>
                  {u.unresolvedDecisions.length ? <div className="note warn" style={{ marginTop: 8 }}>Unresolved: {u.unresolvedDecisions.join("; ")}</div> : null}
                  <div className="small muted" style={{ marginTop: 6 }}>Traceability: {u.sourceTraceability.stepId} · rules {u.sourceTraceability.ruleIds.join(", ") || "—"} · checks {u.sourceTraceability.checkIds.join(", ") || "—"} · actions {u.sourceTraceability.actionIds.join(", ") || "—"} · evidence {u.sourceTraceability.evidenceRefs.join(", ") || "—"}</div>
                </Panel>
              ))}
            </>
          ) : (
            <Note>No Build Contract yet. Generate it from the approved technical design.</Note>
          )}
        </div>
        <div className="stack">
          <BuildActions stage={state.currentStage} hasContract={!!bc} contractVersion={bc?.version} />
          {rp ? (
            <Panel label="Repository Realization Plan" right={<Badge>{rp.buildContractVersion}</Badge>}>
              <div className="small"><b>Reuse:</b> {rp.reuse.join(", ") || "—"}</div>
              <div className="small"><b>Extend / refactor:</b> {rp.extendOrRefactor.join(", ") || "—"}</div>
              <div className="small"><b>Additions:</b> {rp.additions.join(", ") || "—"}</div>
              <div className="small"><b>Tests:</b> {rp.tests.join(", ") || "—"}</div>
              <div className="label" style={{ marginTop: 6 }}>Conflicts</div>
              <ul className="list">{rp.conflicts.length ? rp.conflicts.map((c, i) => <li key={i}>{c.unitId}: {c.description} <StatusBadge value={c.status} /> {c.resolutionDecisionId ? <Badge tone="green">{c.resolutionDecisionId}</Badge> : null}</li>) : <li className="muted">none</li>}</ul>
              <p className="small muted" style={{ marginTop: 6 }}>Conflicts return to the Factory as pending decisions; they are never resolved silently by the coding partner.</p>
            </Panel>
          ) : null}
          {bc ? (
            <Panel label="Coding partner protocol">
              <ol className="list">{bc.codingPartnerProtocol.map((p) => <li key={p}>{p}</li>)}</ol>
              <a className="btn" style={{ marginTop: 8 }} href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(bc, null, 2))}`} download={`build-contract-${bc.version}.json`}>Export Build Contract</a>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
