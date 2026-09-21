"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-client";
import { Panel } from "@/components/ui";
import { SpecialistButton } from "@/components/specialist-button";
import { EVIDENCE_TYPES } from "@/lib/factory/schema";

const SOURCE_CLASSES = ["CLIENT_AUTHORITATIVE", "CLIENT_INFORMAL", "CONSULTANT_OBSERVATION", "SYSTEM_OF_RECORD", "SYNTHETIC_SIMULATION", "THIRD_PARTY"];

export function EvidenceForms({ requirements, contradictions }: { requirements: { requirementId: string; description: string }[]; contradictions: { contradictionId: string; description: string; evidenceRefs: string[] }[] }) {
  const [f, setF] = useState({ title: "", summary: "", evidenceType: "PROCESS_DOCUMENT", sourceClass: "CLIENT_AUTHORITATIVE", scope: "WORKFLOW", environment: "NONE", synthetic: false, requirementIds: [] as string[], claims: "" });
  const [res, setRes] = useState<{ contradictionId: string; resolution: string; supersede: string }>({ contradictionId: contradictions[0]?.contradictionId ?? "", resolution: "", supersede: "" });
  const claims = f.claims
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((kv) => {
      const [key, ...rest] = kv.split("=");
      return { key: key.trim(), value: rest.join("=").trim() };
    })
    .filter((c) => c.key && c.value);
  return (
    <>
      <Panel label="Upload evidence">
        <div className="stack" style={{ gap: 8 }}>
          <div className="field">
            <label>Title</label>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
          <div className="field">
            <label>Summary</label>
            <textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Evidence type</label>
              <select value={f.evidenceType} onChange={(e) => setF({ ...f, evidenceType: e.target.value })}>
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Source class</label>
              <select value={f.sourceClass} onChange={(e) => setF({ ...f, sourceClass: e.target.value })}>
                {SOURCE_CLASSES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Scope</label>
              <input value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} placeholder="WORKFLOW · STEP:WF-002 · INTEGRATION · IMPLEMENTATION · DEPLOYMENT" />
            </div>
            <div className="field">
              <label>Environment</label>
              <select value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}>
                {["NONE", "DEV", "SANDBOX", "UAT", "PRODUCTION"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Relevant requirements</label>
            <select multiple value={f.requirementIds} onChange={(e) => setF({ ...f, requirementIds: [...e.target.selectedOptions].map((o) => o.value) })} style={{ minHeight: 90 }}>
              {requirements.map((r) => (
                <option key={r.requirementId} value={r.requirementId}>
                  {r.requirementId} · {r.description}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Machine-readable claims (key=value, one per line)</label>
            <textarea value={f.claims} onChange={(e) => setF({ ...f, claims: e.target.value })} placeholder={"approval_threshold=15000\nprocedure_revision=Rev5"} />
          </div>
          <label className="row small">
            <input type="checkbox" checked={f.synthetic} onChange={(e) => setF({ ...f, synthetic: e.target.checked })} /> Synthetic / mock (never satisfies real-evidence requirements)
          </label>
          <div className="row">
            <ActionButton actionType="UPLOAD_EVIDENCE" variant="primary" disabled={!f.title.trim()} payload={{ records: [{ ...f, claims }] }} onDone={(r) => r.ok && setF({ ...f, title: "", summary: "", claims: "" })}>
              Ingest record
            </ActionButton>
            <ActionButton actionType="ASSESS_EVIDENCE">Reassess</ActionButton>
          </div>
        </div>
      </Panel>
      <Panel label="AI specialist · evidence intake">
        <p className="small" style={{ marginBottom: 8 }}>
          Inventory and classify the catalog, surface contradictions, and get exactly one next question. Output arrives as a recommendation for you to accept — the engine still decides sufficiency.
        </p>
        <SpecialistButton specialistId="BLUEPRINT" task="EVIDENCE_INTAKE" label="Run evidence intake" />
      </Panel>
      {contradictions.length ? (
        <Panel label="Resolve a contradiction">
          <div className="stack" style={{ gap: 8 }}>
            <select value={res.contradictionId} onChange={(e) => setRes({ ...res, contradictionId: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }}>
              {contradictions.map((c) => (
                <option key={c.contradictionId} value={c.contradictionId}>
                  {c.contradictionId} · {c.description}
                </option>
              ))}
            </select>
            <input placeholder="Resolution (recorded as a human decision)" value={res.resolution} onChange={(e) => setRes({ ...res, resolution: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
            <input placeholder="Supersede evidence refs (comma separated, optional)" value={res.supersede} onChange={(e) => setRes({ ...res, supersede: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
            <div>
              <ActionButton actionType="RESOLVE_CONTRADICTION" variant="primary" disabled={!res.resolution.trim()} payload={{ contradictionId: res.contradictionId, resolution: res.resolution, supersedeEvidenceRefs: res.supersede.split(",").map((x) => x.trim()).filter(Boolean) }}>
                Resolve
              </ActionButton>
            </div>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
