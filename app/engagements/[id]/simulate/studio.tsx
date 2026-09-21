"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionButton } from "@/components/action-client";
import { Badge, Note, Panel, Stat, StatusBadge } from "@/components/ui";
import { activeSteps, type Blueprint } from "@/lib/factory/blueprint";
import type { Job } from "@/lib/factory/schema";
import { SIMULATION_MODES, type ScenarioResult, type SimulationMode, type SimulationPack } from "@/lib/factory/simulation";

type Summary = Record<ScenarioResult, number> & { feedback: Record<string, number> };

export function SimulationStudio({ blueprint: bp, pack, packs, job }: { blueprint: Blueprint; pack?: SimulationPack; packs: { packId: string; mode: SimulationMode; summary: Summary; batch: SimulationPack["batch"] }[]; job?: Job }) {
  const steps = activeSteps(bp);
  const [mode, setMode] = useState<SimulationMode>("BUSINESS_WORKFLOW_VALIDATION");
  const [selected, setSelected] = useState<string>(pack?.scenarios[0]?.scenarioId ?? "");
  const [tab, setTab] = useState<"scenario" | "evidence" | "authority" | "trace" | "feedback">("scenario");
  const [note, setNote] = useState("");
  const sc = pack?.scenarios.find((s) => s.scenarioId === selected) ?? pack?.scenarios[0];
  const run = sc ? pack?.runs[sc.scenarioId] : undefined;
  const step = sc ? steps.find((s) => s.contractId === sc.stepId) : undefined;
  const summary = pack ? packs.find((p) => p.packId === pack.packId)?.summary : undefined;
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Workflow Simulation Studio</h1>
          <div className="small muted">Experience the proposed operating model before approval. Every result is <Badge tone="purple">SYNTHETIC_SIMULATION</Badge> — design-review evidence, never approval or implementation proof.</div>
        </div>
        <div className="row">
          <select value={mode} onChange={(e) => setMode(e.target.value as SimulationMode)} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }}>
            {SIMULATION_MODES.map((m) => (
              <option key={m} value={m}>
                {m.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
          <ActionButton actionType="CREATE_SIMULATION" variant="primary" payload={{ mode }}>
            New scenario pack
          </ActionButton>
        </div>
      </div>

      {pack ? (
        <>
          <div className="grid grid-4 section">
            <Stat label="Batch" value={`${pack.batch.completed}/${pack.batch.total}`} sub={<StatusBadge value={pack.batch.status} />} />
            <Stat label="Pass / fail" value={`${summary?.PASS ?? 0} / ${summary?.FAIL ?? 0}`} sub={`${summary?.PARTIAL ?? 0} partial · ${summary?.BLOCKED_INPUT ?? 0} blocked input · ${summary?.NOT_RUN ?? 0} not run`} tone={summary?.FAIL ? "red" : "green"} />
            <Stat label="Business feedback" value={`${summary?.feedback.CONFIRMS_DESIGN ?? 0} ✓`} sub={`${summary?.feedback.NEEDS_CHANGE ?? 0} needs change · ${summary?.feedback.UNSURE ?? 0} unsure`} />
            <Stat label="Job" value={<span style={{ fontSize: 14 }}>{job ? <StatusBadge value={job.status} /> : "—"}</span>} sub={job?.lastCheckpoint ? `checkpoint ${job.lastCheckpoint.unitId} · ${job.batch.completed}/${job.batch.total}` : "no checkpoint"} />
          </div>
          <div className="row section">
            <ActionButton actionType="RUN_SIMULATION_BATCH" variant="primary" payload={{ packId: pack.packId, limit: 5 }} disabled={pack.batch.status === "COMPLETE" || job?.status === "INTERRUPTED"}>
              Run next 5 scenarios
            </ActionButton>
            <ActionButton actionType="RUN_SIMULATION_BATCH" payload={{ packId: pack.packId }} disabled={pack.batch.status === "COMPLETE" || job?.status === "INTERRUPTED"}>
              Run remaining
            </ActionButton>
            {job && ["RUNNING", "CHECKPOINTED", "QUEUED"].includes(job.status) ? (
              <ActionButton actionType="INTERRUPT_JOB" variant="warn" payload={{ jobId: job.jobId }} reason="Simulated usage cap">
                Simulate interruption
              </ActionButton>
            ) : null}
            {job && ["INTERRUPTED", "CHECKPOINTED"].includes(job.status) ? (
              <ActionButton actionType="RESUME_JOB" variant="secondary" payload={{ jobId: job.jobId }}>
                Resume from checkpoint
              </ActionButton>
            ) : null}
            <span className="small muted">Packs:</span>
            {packs.map((p) => (
              <Link key={p.packId} href={`?pack=${p.packId}`} className={`btn sm${p.packId === pack.packId ? " secondary" : ""}`}>
                {p.packId} · {p.mode.replaceAll("_", " ").toLowerCase()}
              </Link>
            ))}
          </div>

          <div className="grid section" style={{ gridTemplateColumns: "240px minmax(0, 1fr) 280px" }}>
            <Panel label="Scenario library" right={<Badge>{pack.scenarios.length}</Badge>}>
              <div className="stack" style={{ gap: 2 }}>
                {pack.scenarios.map((s) => {
                  const r = pack.runs[s.scenarioId];
                  return (
                    <div key={s.scenarioId} className={`stage${sc?.scenarioId === s.scenarioId ? " active" : r ? " done" : ""}`} style={{ cursor: "pointer" }} onClick={() => setSelected(s.scenarioId)}>
                      <div className="row spread">
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10.5 }}>{s.scenarioId}</span>
                        {r ? <StatusBadge value={r.result} /> : <Badge>not run</Badge>}
                      </div>
                      <div style={{ fontSize: 11.5 }}>{s.title}</div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <div className="stack">
              {sc ? (
                <Panel label={`${sc.scenarioId} · ${sc.title}`} right={run ? <><StatusBadge value={run.result} /> <Badge tone="purple">SYNTHETIC</Badge></> : <Badge>not run</Badge>}>
                  <div className="row" style={{ marginBottom: 8 }}>
                    {steps.map((s) => (
                      <span key={s.contractId} className={`stage${s.contractId === sc.stepId ? " active" : ""}`} style={{ padding: "3px 6px", fontSize: 11 }}>
                        {s.contractId}
                      </span>
                    ))}
                  </div>
                  <div className="tabs">
                    {(["scenario", "evidence", "authority", "trace", "feedback"] as const).map((t) => (
                      <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {tab === "scenario" ? (
                    <dl className="kv">
                      <dt>Trigger</dt><dd>{sc.trigger || "—"}</dd>
                      <dt>Actors</dt><dd>{sc.actors.join(", ")}</dd>
                      <dt>AI actions</dt><dd>{sc.aiActions.join("; ") || "—"}</dd>
                      <dt>Deterministic controls</dt><dd>{sc.deterministicControls.join("; ") || "—"}</dd>
                      <dt>Human decisions</dt><dd>{sc.humanDecisions.join("; ") || "—"}</dd>
                      <dt>Exceptions</dt><dd>{sc.exceptions.join("; ") || "—"}</dd>
                      <dt>Expected outcome</dt><dd>{sc.expectedOutcome || "—"}</dd>
                      <dt>Value effect</dt><dd>{sc.valueEffect}</dd>
                      <dt>Probe</dt><dd>{sc.probe.kind.replaceAll("_", " ").toLowerCase()} {sc.probe.ref ?? ""}</dd>
                    </dl>
                  ) : null}
                  {tab === "evidence" ? (
                    <Note tone="purple">
                      <b>Evidence boundary.</b> A successful run validates the design in simulation only. It cannot establish real integration, UAT, deployment or production readiness. Source IDs: {sc.sourceIds.join(", ")}
                    </Note>
                  ) : null}
                  {tab === "authority" ? (
                    step ? (
                      <dl className="kv">
                        <dt>Autonomy</dt><dd>{step.authority.autonomyLevel}</dd>
                        <dt>AI can advance</dt><dd>{String(step.authority.aiCanAdvance)}</dd>
                        <dt>AI can writeback</dt><dd>{String(step.authority.aiCanWriteback)}</dd>
                        <dt>Human approval</dt><dd>{step.authority.humanApprovalRequired}</dd>
                        <dt>Guardrails</dt><dd>{step.authority.hardGuardrails.join("; ") || "—"}</dd>
                        <dt>Violations</dt><dd>{run?.authorityViolations.length ? run.authorityViolations.map((v) => <div key={v} style={{ color: "var(--red)" }}>{v}</div>) : "none"}</dd>
                      </dl>
                    ) : null
                  ) : null}
                  {tab === "trace" ? (
                    run ? (
                      <div className="stack" style={{ gap: 4 }}>
                        {run.trace.map((t, i) => (
                          <div key={i} className="stage" style={{ borderColor: "#7da2cf" }}>
                            {t}
                          </div>
                        ))}
                        <div className="small muted">Ran {run.ranAt.slice(0, 16).replace("T", " ")} against design v{run.sourceVersion}</div>
                      </div>
                    ) : (
                      <p className="small muted">Not run yet.</p>
                    )
                  ) : null}
                  {tab === "feedback" ? (
                    <div className="stack" style={{ gap: 8 }}>
                      <p className="small">Does this scenario behave the way the business expects the future process to operate? Feedback is design-review evidence, not approval.</p>
                      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
                      <div className="row">
                        {(["CONFIRMS_DESIGN", "NEEDS_CHANGE", "UNSURE"] as const).map((v) => (
                          <ActionButton key={v} actionType="RECORD_SIMULATION_FEEDBACK" variant={v === "CONFIRMS_DESIGN" ? "primary" : v === "NEEDS_CHANGE" ? "warn" : ""} disabled={!run} payload={{ packId: pack.packId, scenarioId: sc.scenarioId, value: v, note }}>
                            {v.replaceAll("_", " ").toLowerCase()}
                          </ActionButton>
                        ))}
                      </div>
                      {run?.feedback ? <div className="small"><StatusBadge value={run.feedback.value} /> by {run.feedback.by} — {run.feedback.note}</div> : null}
                    </div>
                  ) : null}
                </Panel>
              ) : null}
            </div>

            <div className="stack">
              <Panel label="5-layer translation">
                {[
                  ["Experience", "Requester, planner and approver see the relevant state and next action."],
                  ["Workflow", "Controlled state machine preserves prerequisite sequencing."],
                  ["Agents", "AI intake, planning and control-evaluation assistance."],
                  ["Enterprise systems", "Boundaries remain governed; unresolved ownership stays TO_CONFIRM."],
                  ["Governance & observability", "Human approval, lineage, correlation IDs and synthetic-evidence classification."],
                ].map(([t, d], i) => (
                  <div key={t} className="card" style={{ padding: 8, marginBottom: 6 }}>
                    <b style={{ fontSize: 12 }}>
                      {i + 1} · {t}
                    </b>
                    <div className="small muted">{d}</div>
                  </div>
                ))}
              </Panel>
              <Note tone="purple">{pack.warning}</Note>
            </div>
          </div>
        </>
      ) : (
        <div className="section">
          <Note>No scenario pack yet. Choose a mode and create one; scenarios are generated deterministically from the design (standard paths, hard stops, human actions, authority probes, chaos, contract units).</Note>
        </div>
      )}
    </>
  );
}
