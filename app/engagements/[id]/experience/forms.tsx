"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-client";
import { Panel } from "@/components/ui";
import { EXPERIENCE_CLASSIFICATIONS, type ExperienceNote } from "@/lib/factory/schema";

export function ExperienceForms({ notes, inStage, substage }: { notes: ExperienceNote[]; inStage: boolean; substage: string }) {
  const [list, setList] = useState<Partial<ExperienceNote>[]>(notes.length ? notes : [{ classification: "TO_CONFIRM", statement: "", evidenceRefs: [], affectsGovernance: false }]);
  const [rationale, setRationale] = useState("");
  return (
    <>
      <Panel label="Classify experience evidence">
        <div className="stack" style={{ gap: 6 }}>
          {list.map((n, i) => (
            <div key={i} className="card" style={{ padding: 8 }}>
              <select value={n.classification} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, classification: e.target.value as ExperienceNote["classification"] } : x)))} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4, fontSize: 11, marginBottom: 4 }}>
                {EXPERIENCE_CLASSIFICATIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input value={n.statement ?? ""} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, statement: e.target.value } : x)))} placeholder="Statement" style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 4, padding: 4, fontSize: 12 }} />
              <label className="small row" style={{ marginTop: 4 }}>
                <input type="checkbox" checked={!!n.affectsGovernance} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, affectsGovernance: e.target.checked } : x)))} /> affects workflow / authority / data / integration
              </label>
            </div>
          ))}
          <div className="row">
            <button className="btn sm" onClick={() => setList([...list, { classification: "TO_CONFIRM", statement: "", evidenceRefs: [], affectsGovernance: false }])}>+ note</button>
            <ActionButton actionType="SET_EXPERIENCE" variant="secondary" disabled={!inStage} payload={{ notes: list.filter((n) => n.statement?.trim()) }}>Save notes</ActionButton>
          </div>
        </div>
      </Panel>
      <Panel label="Generate and review">
        <div className="stack" style={{ gap: 8 }}>
          <ActionButton actionType="GENERATE_EXPERIENCE" variant="primary" disabled={!inStage}>Generate experience pack</ActionButton>
          <input value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Review rationale" style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
          <div className="row">
            <ActionButton actionType="DECIDE" variant="primary" disabled={!inStage || substage !== "EXPERIENCE_REVIEW" || !rationale.trim()} payload={{ type: "APPROVE", target: { type: "EXPERIENCE", id: "experience" }, rationale }}>Approve representation</ActionButton>
            <ActionButton actionType="DECIDE" variant="warn" disabled={!inStage || substage !== "EXPERIENCE_REVIEW" || !rationale.trim()} payload={{ type: "REQUEST_CHANGES", target: { type: "EXPERIENCE", id: "experience" }, rationale }}>Request changes</ActionButton>
          </div>
          <p className="small muted">Notes that affect workflow, authority, data or integration block generation until the design is changed through governance.</p>
        </div>
      </Panel>
    </>
  );
}
