"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-client";
import { Panel } from "@/components/ui";

export function BuildActions({ stage, hasContract, contractVersion }: { stage: string; hasContract: boolean; contractVersion?: string }) {
  const [f, setF] = useState({ reuse: "", extendOrRefactor: "", additions: "", tests: "", conflicts: "", submittedBy: "coding-partner" });
  const split = (v: string) => v.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
  const conflicts = split(f.conflicts).map((line) => {
    const [unitId, ...rest] = line.split(":");
    return { unitId: unitId.trim(), description: rest.join(":").trim() || unitId.trim(), status: "OPEN" };
  });
  return (
    <>
      <Panel label="Build engine">
        <ActionButton actionType="GENERATE_BUILD_CONTRACT" variant="primary" disabled={!["BUILD_CONTRACT", "IMPLEMENTATION_READINESS"].includes(stage)}>
          {hasContract ? "Regenerate Build Contract" : "Generate Build Contract"}
        </ActionButton>
        <p className="small muted" style={{ marginTop: 6 }}>Deterministic compile: one build unit per active step plus a cross-cutting continuous-improvement unit. Certification checks internal validity only.</p>
      </Panel>
      <Panel label="Coding partner · Repository Realization Plan">
        <div className="stack" style={{ gap: 6 }}>
          {(["reuse", "extendOrRefactor", "additions", "tests"] as const).map((k) => (
            <div className="field" key={k}>
              <label>{k} (comma separated)</label>
              <input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
          <div className="field">
            <label>Conflicts (one per line: BU-WF-004: description)</label>
            <textarea value={f.conflicts} onChange={(e) => setF({ ...f, conflicts: e.target.value })} />
          </div>
          <ActionButton actionType="REGISTER_REALIZATION_PLAN" variant="secondary" disabled={!hasContract} payload={{ plan: { buildContractVersion: contractVersion, reuse: split(f.reuse), extendOrRefactor: split(f.extendOrRefactor), additions: split(f.additions), tests: split(f.tests), conflicts, submittedBy: f.submittedBy } }}>
            Register realization plan
          </ActionButton>
        </div>
      </Panel>
    </>
  );
}
