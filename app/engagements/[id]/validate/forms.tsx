"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-client";
import { SpecialistButton } from "@/components/specialist-button";
import { Panel } from "@/components/ui";

const CLAIM_KEYS = ["source_ids_present", "do_not_replace_respected", "treatment_honoured", "constraints_honoured", "hard_stops_enforced", "human_actions_audited", "check_execution_distinct", "rerun_supported", "writeback_bounded", "tests_passing", "value_telemetry", "observability_aligned", "ci_governed", "arb_reviewed"];

export function ValidateActions({ hasContract }: { hasContract: boolean }) {
  const [f, setF] = useState({ title: "", evidenceType: "REPOSITORY_CODE", scope: "IMPLEMENTATION", environment: "NONE", requirementIds: "EVID-007" });
  const [claims, setClaims] = useState<Record<string, "TRUE" | "FALSE" | "">>({});
  const claimList = Object.entries(claims).filter(([, v]) => v).map(([key, value]) => ({ key, value }));
  return (
    <>
      <Panel label="Submit implementation evidence">
        <div className="stack" style={{ gap: 6 }}>
          <div className="field"><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="PR #42 · CI run #1187 · UAT trace" /></div>
          <div className="form-grid">
            <div className="field"><label>Type</label><select value={f.evidenceType} onChange={(e) => setF({ ...f, evidenceType: e.target.value })}>{["REPOSITORY_CODE", "TEST_RESULTS", "RUNTIME_TRACE", "DEPLOYMENT_CONFIG", "SCREENSHOT", "DEVELOPER_STATEMENT", "DESIGN_DOCUMENT"].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label>Scope</label><input value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} placeholder="IMPLEMENTATION · UNIT:BU-WF-002 · DEPLOYMENT · INTEGRATION" /></div>
            <div className="field"><label>Environment</label><select value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}>{["NONE", "DEV", "SANDBOX", "UAT", "PRODUCTION"].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label>Requirement IDs</label><input value={f.requirementIds} onChange={(e) => setF({ ...f, requirementIds: e.target.value })} /></div>
          </div>
          <div className="label">Machine-readable claims</div>
          <div className="grid grid-2" style={{ gap: 4 }}>
            {CLAIM_KEYS.map((k) => (
              <label key={k} className="row small" style={{ gap: 4 }}>
                <select value={claims[k] ?? ""} onChange={(e) => setClaims({ ...claims, [k]: e.target.value as "TRUE" | "FALSE" | "" })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 2, fontSize: 11 }}>
                  <option value="">—</option>
                  <option value="TRUE">TRUE</option>
                  <option value="FALSE">FALSE</option>
                </select>
                {k}
              </label>
            ))}
          </div>
          <ActionButton actionType="UPLOAD_EVIDENCE" variant="primary" disabled={!f.title.trim()} payload={{ records: [{ title: f.title, evidenceType: f.evidenceType, sourceClass: "SYSTEM_OF_RECORD", scope: f.scope, environment: f.environment, requirementIds: f.requirementIds.split(",").map((x) => x.trim()).filter(Boolean), claims: claimList }] }} onDone={(r) => r.ok && setF({ ...f, title: "" })}>
            Submit evidence
          </ActionButton>
        </div>
      </Panel>
      <Panel label="Code validator">
        <div className="stack" style={{ gap: 8 }}>
          <ActionButton actionType="RUN_VALIDATION" variant="primary" disabled={!hasContract}>Run deterministic validation</ActionButton>
          <SpecialistButton specialistId="CODE_VALIDATOR" label="AI review of evidence gaps" />
          <p className="small muted">Contract certification and implementation validation are separate. PASS / PARTIAL / GAP / FAIL / NOT_ASSESSED per unit.</p>
        </div>
      </Panel>
    </>
  );
}
