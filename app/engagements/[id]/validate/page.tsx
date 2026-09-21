import { notFound } from "next/navigation";
import { Badge, Note, Panel, Stat, StatusBadge } from "@/components/ui";
import { getBuildContract, getValidationReport } from "@/lib/factory/content";
import { getStore } from "@/lib/factory/store";
import { EVIDENCE_HIERARCHY } from "@/lib/factory/validator";
import { ValidateActions } from "./forms";

export const dynamic = "force-dynamic";

export default async function Validate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const bc = getBuildContract(state);
  const report = getValidationReport(state);
  const impl = state.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT" && ["IMPLEMENTATION", "DEPLOYMENT", "INTEGRATION"].some((s) => e.scope.startsWith(s)) || e.scope.startsWith("UNIT:") || e.scope.startsWith("STEP:"));
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Implementation Validation</h1>
          <div className="small muted">Evidence hierarchy: {EVIDENCE_HIERARCHY.map((h) => h.replaceAll("_", " ").toLowerCase()).join(" > ")}. Design documents and developer statements are never deployment proof.</div>
        </div>
        {report ? <Badge>{report.version}</Badge> : null}
      </div>
      <div className="grid grid-4 section">
        {(["PASS", "PARTIAL", "GAP", "FAIL"] as const).map((k) => (
          <Stat key={k} label={k} value={report?.summary[k] ?? 0} tone={k === "PASS" ? "green" : k === "FAIL" || k === "GAP" ? "red" : "amber"} sub={k === "PASS" ? `${report?.summary.NOT_ASSESSED ?? 0} not assessed` : undefined} />
        ))}
      </div>
      {report ? (
        <div className="section">
          <Note tone={report.deploymentProven ? "" : "warn"}>
            Deployment {report.deploymentClaimed ? "claimed" : "not claimed"} · {report.deploymentProven ? "proven by real config/runtime evidence" : "not proven — no real deployment evidence in the DEPLOYMENT scope"}.
          </Note>
        </div>
      ) : null}
      <div className="grid grid-main section">
        <div className="stack">
          {report ? (
            report.units.map((u) => (
              <Panel key={u.unitId} label={u.unitId} right={<><StatusBadge value={u.status} /> {u.highestEvidenceTier ? <Badge tone="blue">{u.highestEvidenceTier.replaceAll("_", " ").toLowerCase()}</Badge> : <Badge tone="amber">no proof-grade evidence</Badge>}</>}>
                {u.findings.length ? <div className="note warn" style={{ marginBottom: 6 }}>{u.findings.join("; ")}</div> : null}
                {u.checks.length ? (
                  <table className="table">
                    <tbody>
                      {u.checks.map((c) => (
                        <tr key={c.name}>
                          <td>{c.name}</td>
                          <td className="small muted">{c.detail}</td>
                          <td><StatusBadge value={c.result} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="small muted">No proof-grade evidence for this unit. Submit repository code, test results, runtime traces or deployment config scoped to UNIT:{u.unitId} or STEP.</p>
                )}
                <div className="small muted" style={{ marginTop: 4 }}>Evidence: {u.evidenceRefs.join(", ") || "none"}</div>
              </Panel>
            ))
          ) : (
            <Note>{bc ? "No validation report yet. Submit implementation evidence and run validation." : "No Build Contract to validate against."}</Note>
          )}
        </div>
        <div className="stack">
          <ValidateActions hasContract={!!bc} />
          <Panel label="Implementation evidence" right={<Badge>{impl.length}</Badge>}>
            <ul className="list">{impl.length ? impl.map((e) => <li key={e.evidenceRef}><b>{e.evidenceRef}</b> {e.title} <Badge>{e.evidenceType.replaceAll("_", " ").toLowerCase()}</Badge> <Badge>{e.scope}</Badge> {e.synthetic ? <Badge tone="purple">synthetic</Badge> : null}</li>) : <li className="muted">none</li>}</ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
