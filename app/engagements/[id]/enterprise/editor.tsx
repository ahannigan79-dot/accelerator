"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-client";
import { SpecialistButton } from "@/components/specialist-button";
import { Badge, Panel, StatusBadge } from "@/components/ui";
import { ENTERPRISE_SECTIONS, type EnterpriseContext, type EnterpriseEntry, type EnterpriseSection } from "@/lib/factory/schema";

const SECTION_META: Record<EnterpriseSection, { label: string; qualifier: string; hint: string }> = {
  architectureStandards: { label: "Architecture standards", qualifier: "Scope", hint: "Principles and standards new work must follow (integration style, hosting, identity, observability reuse)." },
  systems: { label: "Systems in use", qualifier: "Role and hosting", hint: "Systems of record and tools actually used, including spreadsheets, email and manual registers." },
  integrationPatterns: { label: "Integration patterns", qualifier: "Platform or mechanism", hint: "How systems talk to each other today, including interfaces that do not exist." },
  dataDomains: { label: "Data domains", qualifier: "System of record", hint: "Business data with its system of record, owner and sensitivity." },
  securityCompliance: { label: "Security and compliance", qualifier: "Source", hint: "Constraints from policy, regulation or contracts that bound any design." },
  aiPolicy: { label: "AI and automation policy", qualifier: "Source", hint: "What the client allows AI to evaluate, recommend, execute or write back." },
};

export function EnterpriseEditor({ context: ec, evidence, locked, hasEvidence }: { context: EnterpriseContext; evidence: { evidenceRef: string; title: string }[]; locked: boolean; hasEvidence: boolean }) {
  const [gap, setGap] = useState("");
  const [summary, setSummary] = useState(ec.summary);
  const total = ENTERPRISE_SECTIONS.reduce((n, k) => n + ec[k].length, 0);
  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px" }}>
      <div className="stack">
        <Panel label="Summary" right={<StatusBadge value={ec.reviewStatus} />}>
          <textarea disabled={locked} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Two or three sentences on the client's landscape as evidenced." style={{ minHeight: 60, width: "100%" }} />
          {!locked && summary !== ec.summary ? (
            <div className="row" style={{ marginTop: 6 }}>
              <ActionButton actionType="SET_ENTERPRISE_CONTEXT" variant="secondary" payload={{ op: "MERGE", enterpriseContext: { summary } }}>
                Save summary
              </ActionButton>
            </div>
          ) : null}
        </Panel>
        {ENTERPRISE_SECTIONS.map((k) => (
          <SectionPanel key={k} section={k} rows={ec[k]} evidence={evidence} locked={locked} />
        ))}
        <Panel label="Gaps" right={<Badge tone={ec.gaps.length ? "amber" : "green"}>{ec.gaps.length}</Badge>}>
          <p className="small muted">What the evidence does not tell us. Each gap is a question for the client architect before the context can be trusted.</p>
          <ul className="list">
            {ec.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
          {!locked ? (
            <div className="row" style={{ marginTop: 6 }}>
              <input placeholder="Add a gap" value={gap} onChange={(e) => setGap(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6, flex: 1 }} />
              <ActionButton actionType="SET_ENTERPRISE_CONTEXT" disabled={!gap.trim()} payload={{ op: "MERGE", enterpriseContext: { gaps: [gap] } }} onDone={(r) => r.ok && setGap("")}>
                Add gap
              </ActionButton>
            </div>
          ) : null}
        </Panel>
      </div>
      <div className="stack">
        <Panel label="Confirm">
          <p className="small">
            The client architect (or IT operations, security, or the delivery lead on their behalf) confirms this context as the ground truth workflow design builds on. Any later edit reopens it.
          </p>
          <ActionButton actionType="SET_ENTERPRISE_CONTEXT" variant="primary" disabled={!total || ec.reviewStatus === "CONFIRMED"} payload={{ confirm: true }} reason="Enterprise context confirmed as the grounding for workflow design" confirm="Confirm this enterprise context as the client's landscape? Workflow design will be grounded on it.">
            {ec.reviewStatus === "CONFIRMED" ? "Confirmed" : "Confirm enterprise context"}
          </ActionButton>
          {!total ? <div className="small muted" style={{ marginTop: 6 }}>Nothing to confirm yet.</div> : null}
        </Panel>
        <Panel label="AI specialist · enterprise context">
          <p className="small" style={{ marginBottom: 8 }}>
            Drafts every section from the evidence catalog with citations, and lists the gaps. Entries arrive unconfirmed; entries with the same name are replaced, the rest are kept.
          </p>
          {hasEvidence ? <SpecialistButton specialistId="BLUEPRINT" task="ENTERPRISE_CONTEXT" label={total ? "Refine from evidence" : "Draft from evidence"} /> : <span className="small muted">Upload evidence first.</span>}
        </Panel>
        <Panel label="How it is used">
          <ul className="list small">
            <li>The Blueprint specialist receives this section and must name systems, integrations and data owners exactly as recorded here, raising an open item for anything new.</li>
            <li>Integration readiness and the technical compiler read it to keep reuse-first treatment and the client&apos;s observability ecosystem.</li>
            <li>DOCUMENTED needs a cited evidence record; otherwise an entry is CLIENT_STATED or TO_CONFIRM.</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function SectionPanel({ section, rows, evidence, locked }: { section: EnterpriseSection; rows: EnterpriseEntry[]; evidence: { evidenceRef: string; title: string }[]; locked: boolean }) {
  const meta = SECTION_META[section];
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", detail: "", qualifier: "", owner: "", evidenceRefs: [] as string[], status: "CLIENT_STATED" as EnterpriseEntry["status"], sensitivity: "INTERNAL" as NonNullable<EnterpriseEntry["sensitivity"]> });
  return (
    <Panel label={meta.label} right={<Badge>{rows.length}</Badge>}>
      <p className="small muted" style={{ marginBottom: 6 }}>{meta.hint}</p>
      {rows.length ? (
        <table className="table">
          <thead>
            <tr>
              <th>Entry</th>
              <th>{meta.qualifier}</th>
              <th>Owner</th>
              <th>Evidence</th>
              <th>Status</th>
              {!locked ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                  <div className="small muted">{r.detail}</div>
                </td>
                <td className="small">
                  {r.qualifier}
                  {r.sensitivity ? <div><StatusBadge value={r.sensitivity} /></div> : null}
                </td>
                <td className="small">{r.owner}</td>
                <td className="small">{r.evidenceRefs.join(", ") || <span className="muted">none</span>}</td>
                <td>
                  <StatusBadge value={r.status} />
                </td>
                {!locked ? (
                  <td>
                    <ActionButton actionType="SET_ENTERPRISE_CONTEXT" variant="danger" payload={{ op: "REMOVE_ENTRY", entryId: r.id }} confirm={`Remove ${r.name}?`}>
                      ×
                    </ActionButton>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="small muted">Nothing recorded.</p>
      )}
      {!locked ? (
        adding ? (
          <div className="card" style={{ padding: 8, marginTop: 8 }}>
            <div className="stack" style={{ gap: 6 }}>
              <input placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
              <input placeholder="Detail" value={f.detail} onChange={(e) => setF({ ...f, detail: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
              <div className="row">
                <input placeholder={meta.qualifier} value={f.qualifier} onChange={(e) => setF({ ...f, qualifier: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6, flex: 1 }} />
                <input placeholder="Owner" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6, flex: 1 }} />
              </div>
              <div className="row">
                <select multiple value={f.evidenceRefs} onChange={(e) => setF({ ...f, evidenceRefs: [...e.target.selectedOptions].map((o) => o.value) })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4, minHeight: 60, flex: 1 }}>
                  {evidence.map((e) => (
                    <option key={e.evidenceRef} value={e.evidenceRef}>
                      {e.evidenceRef} {e.title.slice(0, 50)}
                    </option>
                  ))}
                </select>
                <div className="stack" style={{ gap: 6 }}>
                  <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EnterpriseEntry["status"] })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4 }}>
                    {["DOCUMENTED", "CLIENT_STATED", "TO_CONFIRM"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  {section === "dataDomains" ? (
                    <select value={f.sensitivity} onChange={(e) => setF({ ...f, sensitivity: e.target.value as NonNullable<EnterpriseEntry["sensitivity"]> })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4 }}>
                      {["PUBLIC", "INTERNAL", "CONFIDENTIAL", "PERSONAL", "TO_CONFIRM"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
              <div className="row">
                <ActionButton actionType="SET_ENTERPRISE_CONTEXT" variant="primary" disabled={!f.name.trim()} payload={{ op: "MERGE", enterpriseContext: { [section]: [{ ...f, sensitivity: section === "dataDomains" ? f.sensitivity : undefined }] } }} onDone={(r) => { if (r.ok) { setAdding(false); setF({ ...f, name: "", detail: "", qualifier: "", owner: "", evidenceRefs: [] }); } }}>
                  Add entry
                </ActionButton>
                <button className="btn" onClick={() => setAdding(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>
            + Add entry
          </button>
        )
      ) : null}
    </Panel>
  );
}
