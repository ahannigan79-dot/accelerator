"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FrontDoorActions({ hasEngagements }: { hasEngagements: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "start" | "continue" | "validate">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ clientName: "", engagementName: "", workflowName: "", consultantName: "", clientObjective: "", industry: "" });
  const [continueId, setContinueId] = useState("");

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/engagements", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error ?? "Failed");
    router.push(`/engagements/${json.engagementId}`);
  }
  async function loadDemo(stage: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage }) });
    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error ?? "Failed");
    router.push(`/engagements/${json.engagementId}`);
    router.refresh();
  }
  async function cont() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/engagements/${encodeURIComponent(continueId.trim())}`);
    const json = await res.json();
    setBusy(false);
    if (!json.ok) return setError(json.error ?? "Not found");
    router.push(`/engagements/${continueId.trim()}`);
  }

  return (
    <>
      <div className="actions">
        <div className="action">
          <h2>Start an engagement</h2>
          <p>Minimum setup only: client, consultant role, objective if known. Unknowns are stored as TO_CONFIRM.</p>
          <button className="btn primary" onClick={() => setMode(mode === "start" ? "none" : "start")}>
            Start
          </button>
        </div>
        <div className="action">
          <h2>Continue from state</h2>
          <p>Reload the authoritative Factory State and regenerate the runtime projection. No chat-history reconstruction.</p>
          <button className="btn secondary" onClick={() => setMode(mode === "continue" ? "none" : "continue")} disabled={!hasEngagements && mode !== "continue"}>
            Continue
          </button>
        </div>
        <div className="action">
          <h2>Validate implementation</h2>
          <p>Bring repository, test, trace and deployment evidence to the Build Contract. Statements are never proof.</p>
          <button className="btn secondary" onClick={() => setMode(mode === "validate" ? "none" : "validate")}>
            Validate
          </button>
        </div>
      </div>

      {mode === "start" ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-label">New engagement</div>
          <div className="panel-body">
            <div className="form-grid">
              {(
                [
                  ["clientName", "Client"],
                  ["engagementName", "Engagement"],
                  ["workflowName", "Workflow in scope"],
                  ["consultantName", "Consultant"],
                  ["industry", "Industry (optional)"],
                ] as const
              ).map(([k, label]) => (
                <div className="field" key={k}>
                  <label>{label}</label>
                  <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Client objective (leave blank if unknown → TO_CONFIRM)</label>
                <textarea value={form.clientObjective} onChange={(e) => setForm({ ...form, clientObjective: e.target.value })} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" disabled={busy} onClick={start}>
                Create engagement
              </button>
              <span className="small muted">You will be invited to upload whatever material already exists.</span>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "continue" ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-label">Continue from state</div>
          <div className="panel-body row">
            <input placeholder="Engagement ID (e.g. ENG-DEMO-FIELD-SERVICE)" value={continueId} onChange={(e) => setContinueId(e.target.value)} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 4, padding: "7px 9px" }} />
            <button className="btn primary" disabled={busy || !continueId.trim()} onClick={cont}>
              Open workspace
            </button>
          </div>
        </div>
      ) : null}

      {mode === "validate" ? (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel-label">Validate implementation</div>
          <div className="panel-body stack">
            <p className="small">Validation runs inside an engagement that has an approved Build Contract. Open the engagement and use <b>Validate</b>, or load the demo at the implementation stage.</p>
            <div className="row">
              <button className="btn secondary" disabled={busy} onClick={() => loadDemo("IMPLEMENTATION_VALIDATION")}>
                Load demo at implementation validation
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 12 }}>
        <span className="small muted">Synthetic demo engagement (fictional client, brand-neutral):</span>
        {(["DISCOVERY", "BASELINE_APPROVAL", "TARGET_DESIGN", "TECHNICAL_DESIGN", "BUILD_CONTRACT", "RELEASE_READINESS"] as const).map((s) => (
          <button key={s} className="btn sm" disabled={busy} onClick={() => loadDemo(s)}>
            {s.replaceAll("_", " ").toLowerCase()}
          </button>
        ))}
      </div>
      {error ? (
        <div className="note danger" style={{ marginTop: 10 }}>
          {error}
        </div>
      ) : null}
    </>
  );
}
