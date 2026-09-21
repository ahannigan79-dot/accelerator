"use client";

import { useMemo, useState } from "react";
import { ActionButton, useAction } from "@/components/action-client";
import { SpecialistButton } from "@/components/specialist-button";
import { Badge, Note, Panel, StatusBadge } from "@/components/ui";
import { activeSteps, IMPLEMENTATION_TREATMENTS, type Blueprint, type DesignCompletion, type StepDiff, type WorkflowStep } from "@/lib/factory/blueprint";
import type { ValueNorthStar } from "@/lib/factory/schema";

type Tab = "business" | "rules" | "checks" | "actions" | "currentAi" | "technical" | "notes";

export function BlueprintCanvas(props: { blueprint: Blueprint; stage: string; stateRevision: number; designCompletion: DesignCompletion; technical: { ready: boolean; reasons: string[] }; commandCenter: { ready: boolean; reasons: string[] }; diff: StepDiff[]; hasSnapshot: boolean; snapshotVersion?: string; underReview: boolean; valueNorthStar: ValueNorthStar; evidence: { evidenceRef: string; title: string }[] }) {
  const { blueprint: bp, designCompletion: dc, underReview } = props;
  const steps = useMemo(() => activeSteps(bp), [bp]);
  const [selectedId, setSelectedId] = useState<string>(steps[0]?.contractId ?? "");
  const [tab, setTab] = useState<Tab>("business");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [showCompare, setShowCompare] = useState(false);
  const selected = steps.find((s) => s.contractId === selectedId) ?? steps[0];
  const diffFor = (id: string) => props.diff.find((d) => d.contractId === id);
  const pct = Math.round((dc.areas.reduce((s, a) => s + (a.total ? a.done / a.total : 1), 0) / dc.areas.length) * 100);
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Workflow Blueprint</h1>
          <div className="small muted">
            {bp.workflowId} · v{bp.version} · {bp.mode} · state rev {props.stateRevision} · {steps.length} active steps
            {props.hasSnapshot ? <> · review snapshot v{props.snapshotVersion}</> : null}
          </div>
        </div>
        <div className="row">
          {props.diff.length ? (
            <button className="btn" onClick={() => setShowCompare(!showCompare)}>
              {showCompare ? "Hide" : "Compare to baseline"}
            </button>
          ) : null}
          <a className="btn" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(bp, null, 2))}`} download={`${bp.workflowId}-v${bp.version}.json`}>
            Export design
          </a>
          {!underReview && ["BASELINE_DESIGN", "TARGET_DESIGN"].includes(props.stage) ? (
            <ActionButton actionType="SUBMIT_FOR_REVIEW" variant="primary" confirm="Create a protected review snapshot and open the approval stage?">
              Submit for review
            </ActionButton>
          ) : null}
        </div>
      </div>
      {underReview ? <div className="section"><Note tone="warn">The design is under protected review (snapshot v{props.snapshotVersion}). Editing is locked until a reviewer requests changes.</Note></div> : null}

      <div className="grid section" style={{ gridTemplateColumns: "minmax(0, 1fr) 340px" }}>
        <div className="stack">
          {/* Design completion */}
          <Panel label="Design completion gates" right={<Badge tone={dc.complete ? "green" : "amber"}>{dc.complete ? "COMPLETE" : `${pct}%`}</Badge>}>
            <div className="grid grid-4" style={{ gap: 8 }}>
              {dc.areas.map((a) => (
                <div key={a.key} className="card" style={{ padding: 8 }}>
                  <div className="label">{a.label}</div>
                  <div className="row spread">
                    <b>
                      {a.done}/{a.total}
                    </b>
                    <StatusBadge value={a.complete ? "COMPLETE" : "OPEN"} />
                  </div>
                  <div className="progress" style={{ marginTop: 4 }}>
                    <span style={{ width: `${a.total ? (a.done / a.total) * 100 : 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {dc.invariantViolations.length ? (
              <Note tone="danger">
                Canonical check invariant violations: {dc.invariantViolations.join("; ")}
              </Note>
            ) : null}
            {!underReview ? (
              <div className="row" style={{ marginTop: 10 }}>
                <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "CONFIRM_ALL_STEPS" }}>
                  Confirm all step structures
                </ActionButton>
                <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "CONFIRM_ALL_CHECKS" }}>
                  Confirm all checks
                </ActionButton>
                <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "CONFIRM_ALL_ACTIONS" }}>
                  Confirm all human actions
                </ActionButton>
                <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "CONFIRM_ALL_CURRENT_AI" }}>
                  Confirm current AI inventory
                </ActionButton>
              </div>
            ) : null}
            <p className="small muted" style={{ marginTop: 6 }}>
              Top-level workflow confirmation never implicitly approves checks, human actions, value, AI authority, rule evidence, ARB or as-built status.
            </p>
          </Panel>

          {/* Stage navigation + canvas */}
          <div className="tabs">
            <button className={`tab${phaseFilter === "all" ? " active" : ""}`} onClick={() => setPhaseFilter("all")}>
              All phases
            </button>
            {bp.phases.map((p) => (
              <button key={p.key} className={`tab${phaseFilter === p.key ? " active" : ""}`} onClick={() => setPhaseFilter(p.key)}>
                {p.name}
              </button>
            ))}
          </div>
          <div className="canvas" style={{ gridTemplateColumns: `repeat(${phaseFilter === "all" ? bp.phases.length : 1}, minmax(220px, 1fr))` }}>
            {bp.phases
              .filter((p) => phaseFilter === "all" || p.key === phaseFilter)
              .map((p) => (
                <div key={p.key} className="phase">
                  <h4>{p.name}</h4>
                  <div className="desc">{p.desc}</div>
                  {steps
                    .filter((s) => s.phase === p.key)
                    .map((s) => {
                      const d = diffFor(s.contractId);
                      return (
                        <div key={s.contractId} className={`stepcard ${s.status}${selected?.contractId === s.contractId ? " selected" : ""}`} onClick={() => setSelectedId(s.contractId)}>
                          <div className="row spread">
                            <span className="id">{s.contractId}</span>
                            <span>
                              {showCompare && d && d.change !== "UNCHANGED" ? <Badge tone="blue">{d.change}</Badge> : null} <StatusBadge value={s.status} />
                            </span>
                          </div>
                          <div className="title">{s.name}</div>
                          <div className="meta">
                            {s.owner} · {s.type} · {s.rules.length} rules · {s.checks.length} checks · {s.humanActions.length} actions
                          </div>
                          <div className="meta">
                            <StatusBadge value={s.implementation.targetState.treatment} /> {s.authority.autonomyLevel !== "TBD" ? <Badge tone="accent">{s.authority.autonomyLevel}</Badge> : <Badge tone="amber">authority TBD</Badge>}
                          </div>
                        </div>
                      );
                    })}
                  {!underReview ? (
                    <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "ADD_STEP", step: { phase: p.key, name: "New step", owner: "TO_CONFIRM", lane: "ops", type: "mixed", purpose: "TO_CONFIRM" }, afterSeq: Math.max(0, ...steps.filter((s) => s.phase === p.key).map((s) => s.seq)) }}>
                      + Add step
                    </ActionButton>
                  ) : null}
                </div>
              ))}
          </div>

          {showCompare && props.diff.length ? (
            <Panel label="Baseline comparison">
              <table className="table">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Change</th>
                    <th>Fields</th>
                  </tr>
                </thead>
                <tbody>
                  {props.diff.map((d) => (
                    <tr key={d.contractId}>
                      <td>
                        <b>{d.contractId}</b> {d.name}
                      </td>
                      <td>
                        <StatusBadge value={d.change} />
                      </td>
                      <td className="small">{d.fields.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : null}

          {/* Current AI inventory */}
          <Panel label="Current AI inventory" right={<Badge>{bp.currentAi.length}</Badge>}>
            {bp.currentAi.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Capability</th>
                    <th>Current position</th>
                    <th>Treatment</th>
                    <th>Evidence</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {bp.currentAi.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <b>{c.id}</b> {c.capability}
                        <div className="small muted">{c.category} · {c.workflowRefs.join(", ")}</div>
                      </td>
                      <td className="small">
                        {c.currentPosition}
                        <div className="muted">{c.why}</div>
                      </td>
                      <td>
                        <StatusBadge value={c.treatment} />
                      </td>
                      <td>
                        <StatusBadge value={c.evidenceStatus} />
                      </td>
                      <td>
                        <StatusBadge value={c.reviewStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="small muted">No current AI capability recorded. Current AI review is independent from deployment verification.</p>
            )}
          </Panel>

          <Panel label="Downstream handoff readiness">
            <div className="grid grid-2">
              <div className="card">
                <div className="row spread">
                  <h3>Technical Spec handoff</h3>
                  <StatusBadge value={props.technical.ready ? "OK" : "BLOCKED"} />
                </div>
                <ul className="list">{props.technical.ready ? <li>Design contract can be handed to the Technical Compiler.</li> : props.technical.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
              <div className="card">
                <div className="row spread">
                  <h3>Command Center handoff</h3>
                  <StatusBadge value={props.commandCenter.ready ? "OK" : "BLOCKED"} />
                </div>
                <ul className="list">{props.commandCenter.ready ? <li>Workflow can be published to a shared registry.</li> : props.commandCenter.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            </div>
          </Panel>
        </div>

        {/* Inspector */}
        <div className="stack">
          <ValueNorthStarPanel v={props.valueNorthStar} locked={underReview} />
          {selected ? <Inspector step={selected} steps={steps} tab={tab} setTab={setTab} locked={underReview} evidence={props.evidence} /> : null}
          <Panel label="AI specialist">
            <SpecialistButton specialistId="BLUEPRINT" label={bp.mode === "TARGET" ? "Propose target redesign" : "Re-derive from evidence"} />
          </Panel>
        </div>
      </div>
    </>
  );
}

function ValueNorthStarPanel({ v, locked }: { v: ValueNorthStar; locked: boolean }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(v);
  const fields: (keyof ValueNorthStar)[] = ["objective", "primaryMetric", "metricDefinition", "measurementGranularity", "unit", "startEvent", "endEvent", "baseline", "target", "owner", "reportingCadence"];
  return (
    <Panel label="Value North Star" right={<StatusBadge value={v.reviewStatus} />}>
      {edit ? (
        <div className="stack" style={{ gap: 6 }}>
          {fields.map((k) => (
            <div className="field" key={k}>
              <label>{k}</label>
              <input value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
          <div className="field">
            <label>direction</label>
            <select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as ValueNorthStar["direction"] })}>
              {["LOWER_IS_BETTER", "HIGHER_IS_BETTER", "TO_CONFIRM"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="row">
            <ActionButton actionType="SET_VALUE_NORTH_STAR" variant="primary" payload={{ valueNorthStar: f }} onDone={(r) => r.ok && setEdit(false)}>
              Save (unconfirmed)
            </ActionButton>
            <button className="btn" onClick={() => setEdit(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--deep)" }}>{v.primaryMetric}</div>
          <div className="small">{v.objective}</div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {v.startEvent} → {v.endEvent} · {v.unit} · {v.direction.replaceAll("_", " ").toLowerCase()} · baseline {v.baseline} · target {v.target} · owner {v.owner} · {v.reportingCadence}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {!locked ? (
              <button className="btn sm" onClick={() => setEdit(true)}>
                Edit
              </button>
            ) : null}
            <ActionButton actionType="SET_VALUE_NORTH_STAR" variant="secondary" payload={{ valueNorthStar: {}, confirm: true }} reason="Value North Star confirmed by accountable owner">
              Confirm (client owner)
            </ActionButton>
          </div>
        </>
      )}
    </Panel>
  );
}

function Inspector({ step: s, steps, tab, setTab, locked, evidence }: { step: WorkflowStep; steps: WorkflowStep[]; tab: Tab; setTab: (t: Tab) => void; locked: boolean; evidence: { evidenceRef: string; title: string }[] }) {
  const { run } = useAction();
  const tabs: [Tab, string][] = [
    ["business", "Business"],
    ["rules", "Rules"],
    ["checks", "Checks"],
    ["actions", "Actions"],
    ["currentAi", "Authority"],
    ["technical", "Technical"],
    ["notes", "Notes"],
  ];
  const sid = s.contractId;
  return (
    <Panel label={`${sid} · ${s.name}`} right={<StatusBadge value={s.status} />}>
      <div className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={`tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "business" ? (
        <div className="stack" style={{ gap: 6 }}>
          <EditableFields step={s} locked={locked} />
          {!locked ? (
            <div className="row">
              <ActionButton actionType="UPDATE_BLUEPRINT" variant="primary" payload={{ op: "CONFIRM_STEP", stepId: sid, status: "confirmed" }}>
                Confirm structure
              </ActionButton>
              <ActionButton actionType="UPDATE_BLUEPRINT" variant="warn" payload={{ op: "CONFIRM_STEP", stepId: sid, status: "changes_requested" }}>
                Request changes
              </ActionButton>
              <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "MOVE_STEP", stepId: sid, direction: "up" }}>
                ↑
              </ActionButton>
              <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "MOVE_STEP", stepId: sid, direction: "down" }}>
                ↓
              </ActionButton>
              <ActionButton actionType="UPDATE_BLUEPRINT" variant="danger" payload={{ op: "ARCHIVE_STEP", stepId: sid }} confirm="Archive this step? Dependents will be re-opened for review.">
                Archive
              </ActionButton>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "rules" ? (
        <div className="stack" style={{ gap: 8 }}>
          {s.rules.map((r) => (
            <div key={r.ruleId} className="card" style={{ padding: 8 }}>
              <div className="row spread">
                <b style={{ fontSize: 12 }}>{r.ruleId}</b>
                <span>
                  {r.hardStop ? <Badge tone="red">HARD STOP</Badge> : null} <Badge>{r.ruleType}</Badge> <StatusBadge value={r.provenance.status} />
                </span>
              </div>
              <div className="small">{r.statement}</div>
              <div className="small muted">
                Provenance: {r.provenance.sourceType} {r.provenance.sourceRef}
              </div>
              {!locked ? (
                <div className="row" style={{ marginTop: 6 }}>
                  <select
                    defaultValue={r.provenance.sourceRef}
                    onChange={(e) => run("UPDATE_BLUEPRINT", { op: "SET_RULE", stepId: sid, ruleId: r.ruleId, fields: { provenance: { sourceRef: e.target.value, sourceType: "EVIDENCE", status: e.target.value ? "SOURCE_SUPPORTED" : "UNCONFIRMED" } } })}
                    style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4, fontSize: 11 }}
                  >
                    <option value="">Link evidence…</option>
                    {evidence.map((e) => (
                      <option key={e.evidenceRef} value={e.evidenceRef}>
                        {e.evidenceRef} {e.title.slice(0, 40)}
                      </option>
                    ))}
                  </select>
                  <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "SET_RULE", stepId: sid, ruleId: r.ruleId, fields: { provenance: { status: "CLIENT_CONFIRMED", sourceType: "CLIENT_CONFIRMATION" } } }}>
                    Client confirmed
                  </ActionButton>
                  <ActionButton actionType="UPDATE_BLUEPRINT" payload={{ op: "SET_RULE", stepId: sid, ruleId: r.ruleId, fields: { hardStop: !r.hardStop } }}>
                    {r.hardStop ? "Unset hard stop" : "Set hard stop"}
                  </ActionButton>
                </div>
              ) : null}
            </div>
          ))}
          {!locked ? <AddRule stepId={sid} /> : null}
        </div>
      ) : null}

      {tab === "checks" ? (
        <div className="stack" style={{ gap: 8 }}>
          {s.checks.map((c) => (
            <div key={c.checkId} className="card" style={{ padding: 8 }}>
              <div className="row spread">
                <b style={{ fontSize: 12 }}>
                  {c.checkId} · {c.name}
                </b>
                <StatusBadge value={c.reviewStatus} />
              </div>
              <div className="small">{c.purpose}</div>
              <dl className="kv" style={{ marginTop: 4, gridTemplateColumns: "110px 1fr" }}>
                <dt>Executes</dt>
                <dd>
                  {c.execution.stepId} · {c.execution.persona} · {c.execution.point}
                </dd>
                <dt>Consumed by</dt>
                <dd>{c.supportsDecisionStepIds.join(", ") || <span className="muted">none — prepared without a downstream decision</span>}</dd>
                <dt>Expected</dt>
                <dd>{c.expectedResult}</dd>
                <dt>Pass / fail</dt>
                <dd>
                  {c.passAction} / {c.failAction}
                </dd>
                <dt>Output</dt>
                <dd>{c.output}</dd>
                <dt>Authority</dt>
                <dd>{c.authority}</dd>
                <dt>Logic</dt>
                <dd>
                  {c.logicType} · impl {c.implementationStatus.toLowerCase()}
                </dd>
              </dl>
              {!locked ? (
                <div className="row" style={{ marginTop: 6 }}>
                  <ActionButton actionType="UPDATE_BLUEPRINT" variant="primary" payload={{ op: "CONFIRM_CHECK", stepId: sid, checkId: c.checkId, status: "confirmed" }}>
                    Confirm
                  </ActionButton>
                  <ActionButton actionType="UPDATE_BLUEPRINT" variant="warn" payload={{ op: "CONFIRM_CHECK", stepId: sid, checkId: c.checkId, status: "changes_requested" }}>
                    Changes
                  </ActionButton>
                </div>
              ) : null}
            </div>
          ))}
          {!locked ? <AddCheck stepId={sid} steps={steps} /> : null}
        </div>
      ) : null}

      {tab === "actions" ? (
        <div className="stack" style={{ gap: 8 }}>
          {s.humanActions.map((a) => (
            <div key={a.actionId} className="card" style={{ padding: 8 }}>
              <div className="row spread">
                <b style={{ fontSize: 12 }}>
                  {a.actionId} · {a.name}
                </b>
                <StatusBadge value={a.reviewStatus} />
              </div>
              <dl className="kv" style={{ marginTop: 4, gridTemplateColumns: "110px 1fr" }}>
                <dt>Actor</dt>
                <dd>{a.actor}</dd>
                <dt>Available when</dt>
                <dd>{a.availableWhen}</dd>
                <dt>Preconditions</dt>
                <dd>{a.preconditions}</dd>
                <dt>Effect</dt>
                <dd>{a.effect}</dd>
                <dt>Next state</dt>
                <dd>
                  {a.nextState} → {a.targetStepId} ({a.routingMode.replaceAll("_", " ").toLowerCase()})
                </dd>
                <dt>Audit</dt>
                <dd>{a.auditRequirements}</dd>
              </dl>
              {!locked ? (
                <div className="row" style={{ marginTop: 6 }}>
                  <ActionButton actionType="UPDATE_BLUEPRINT" variant="primary" payload={{ op: "CONFIRM_ACTION", stepId: sid, actionId: a.actionId, status: "confirmed" }}>
                    Confirm
                  </ActionButton>
                  <ActionButton actionType="UPDATE_BLUEPRINT" variant="warn" payload={{ op: "CONFIRM_ACTION", stepId: sid, actionId: a.actionId, status: "changes_requested" }}>
                    Changes
                  </ActionButton>
                </div>
              ) : null}
            </div>
          ))}
          {!locked ? <AddAction stepId={sid} steps={steps} /> : null}
        </div>
      ) : null}

      {tab === "currentAi" ? <AuthorityEditor step={s} locked={locked} /> : null}
      {tab === "technical" ? <TechnicalEditor step={s} locked={locked} /> : null}
      {tab === "notes" ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="small">{s.notes || <span className="muted">No notes.</span>}</div>
          <div className="small">
            <b>Evidence:</b> {s.evidenceRefs.join(", ") || <span className="muted">none linked</span>}
          </div>
          <div className="small">
            <b>Current AI refs:</b> {s.currentAiRefs.join(", ") || <span className="muted">none</span>}
          </div>
          <div className="small">
            <b>Origin:</b> {s.origin}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}

function EditableFields({ step: s, locked }: { step: WorkflowStep; locked: boolean }) {
  const [f, setF] = useState({ name: s.name, owner: s.owner, type: s.type, purpose: s.purpose, trigger: s.trigger, aiRole: s.aiRole, humanAuthority: s.humanAuthority, outcome: s.outcome, exceptions: s.exceptions, rerun: s.rerun, writeback: s.writeback, systems: s.systems.join(", "), reads: s.reads.join(", "), writes: s.writes.join(", ") });
  const [dirty, setDirty] = useState(false);
  const set = (k: keyof typeof f, v: string) => {
    setF({ ...f, [k]: v });
    setDirty(true);
  };
  const split = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  const rows: [keyof typeof f, string, boolean][] = [
    ["name", "Name", false],
    ["owner", "Owner", false],
    ["purpose", "Purpose", true],
    ["trigger", "Trigger", false],
    ["aiRole", "AI role", true],
    ["humanAuthority", "Human authority", true],
    ["systems", "Systems (comma separated)", false],
    ["reads", "Reads", false],
    ["writes", "Writes", false],
    ["outcome", "Outcome", false],
    ["exceptions", "Exceptions", true],
    ["rerun", "Rerun behaviour", true],
    ["writeback", "Writeback boundary", true],
  ];
  return (
    <div className="stack" style={{ gap: 6 }}>
      {rows.map(([k, label, multi]) => (
        <div className="field" key={k}>
          <label>{label}</label>
          {multi ? <textarea disabled={locked} value={f[k]} onChange={(e) => set(k, e.target.value)} style={{ minHeight: 44 }} /> : <input disabled={locked} value={f[k]} onChange={(e) => set(k, e.target.value)} />}
        </div>
      ))}
      <div className="field">
        <label>Type</label>
        <select disabled={locked} value={f.type} onChange={(e) => set("type", e.target.value)}>
          {["human", "ai", "system", "mixed"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {!locked ? (
        <ActionButton actionType="UPDATE_BLUEPRINT" variant="secondary" disabled={!dirty} payload={{ op: "SET_STEP", stepId: s.contractId, fields: { ...f, systems: split(f.systems), reads: split(f.reads), writes: split(f.writes) } }} onDone={(r) => r.ok && setDirty(false)}>
          Save step (re-opens review of dependents)
        </ActionButton>
      ) : null}
    </div>
  );
}

function AddRule({ stepId }: { stepId: string }) {
  const [st, setSt] = useState("");
  const [type, setType] = useState("Business Policy");
  const [hard, setHard] = useState(false);
  return (
    <div className="card" style={{ padding: 8 }}>
      <div className="stack" style={{ gap: 6 }}>
        <input placeholder="Rule statement" value={st} onChange={(e) => setSt(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
        <div className="row">
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4 }}>
            {["Business Policy", "Deterministic", "Regulatory", "Human Authority", "Data Quality"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <label className="small row">
            <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} /> hard stop
          </label>
          <ActionButton actionType="UPDATE_BLUEPRINT" disabled={!st.trim()} payload={{ op: "ADD_RULE", stepId, rule: { statement: st, ruleType: type, hardStop: hard } }} onDone={(r) => r.ok && setSt("")}>
            Add rule
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function AddCheck({ stepId, steps }: { stepId: string; steps: WorkflowStep[] }) {
  const [f, setF] = useState({ name: "", purpose: "", expectedResult: "", passAction: "", failAction: "", output: "", supportsDecisionStepIds: [] as string[], logicType: "Deterministic" });
  return (
    <div className="card" style={{ padding: 8 }}>
      <div className="stack" style={{ gap: 6 }}>
        {(["name", "purpose", "expectedResult", "passAction", "failAction", "output"] as const).map((k) => (
          <input key={k} placeholder={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
        ))}
        <div className="row">
          <select multiple value={f.supportsDecisionStepIds} onChange={(e) => setF({ ...f, supportsDecisionStepIds: [...e.target.selectedOptions].map((o) => o.value) })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4, minHeight: 60, flex: 1 }}>
            {steps
              .filter((s) => s.contractId !== stepId)
              .map((s) => (
                <option key={s.contractId} value={s.contractId}>
                  consumed by {s.contractId} {s.name}
                </option>
              ))}
          </select>
          <ActionButton actionType="UPDATE_BLUEPRINT" disabled={!f.name.trim()} payload={{ op: "ADD_CHECK", stepId, check: f }} onDone={(r) => r.ok && setF({ ...f, name: "", purpose: "" })}>
            Add check
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function AddAction({ stepId, steps }: { stepId: string; steps: WorkflowStep[] }) {
  const [f, setF] = useState({ name: "", actor: "", availableWhen: "", preconditions: "", effect: "", nextState: "", targetStepId: stepId, auditRequirements: "Actor, timestamp, precondition snapshot" });
  return (
    <div className="card" style={{ padding: 8 }}>
      <div className="stack" style={{ gap: 6 }}>
        {(["name", "actor", "availableWhen", "preconditions", "effect", "nextState", "auditRequirements"] as const).map((k) => (
          <input key={k} placeholder={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
        ))}
        <div className="row">
          <select value={f.targetStepId} onChange={(e) => setF({ ...f, targetStepId: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4, flex: 1 }}>
            {steps.map((s) => (
              <option key={s.contractId} value={s.contractId}>
                → {s.contractId} {s.name}
              </option>
            ))}
            <option value="DYNAMIC_AFFECTED_STEP">→ dynamic affected step</option>
          </select>
          <ActionButton actionType="UPDATE_BLUEPRINT" disabled={!f.name.trim() || !f.actor.trim()} payload={{ op: "ADD_ACTION", stepId, action: f }} onDone={(r) => r.ok && setF({ ...f, name: "" })}>
            Add action
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function AuthorityEditor({ step: s, locked }: { step: WorkflowStep; locked: boolean }) {
  const [a, setA] = useState(s.authority);
  const bools: (keyof typeof a)[] = ["aiCanEvaluate", "aiCanRecommend", "aiCanExecute", "aiCanWriteback", "aiCanAdvance"];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="field">
        <label>Autonomy level</label>
        <select disabled={locked} value={a.autonomyLevel} onChange={(e) => setA({ ...a, autonomyLevel: e.target.value as typeof a.autonomyLevel })}>
          {["TBD", "NONE", "ASSIST", "RECOMMEND", "EXECUTE_WITH_APPROVAL", "EXECUTE_BOUNDED"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      {bools.map((k) => (
        <div className="row spread small" key={k}>
          <span>{k}</span>
          <select disabled={locked} value={a[k] === null ? "null" : String(a[k])} onChange={(e) => setA({ ...a, [k]: e.target.value === "null" ? null : e.target.value === "true" })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 3 }}>
            <option value="null">unresolved</option>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        </div>
      ))}
      <div className="field">
        <label>Human approval required</label>
        <select disabled={locked} value={a.humanApprovalRequired} onChange={(e) => setA({ ...a, humanApprovalRequired: e.target.value as typeof a.humanApprovalRequired })}>
          {["TBD", "ALWAYS", "ON_EXCEPTION", "NEVER"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Hard guardrails (one per line)</label>
        <textarea disabled={locked} value={a.hardGuardrails.join("\n")} onChange={(e) => setA({ ...a, hardGuardrails: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
      </div>
      {!locked ? (
        <ActionButton actionType="UPDATE_BLUEPRINT" variant="primary" payload={{ op: "SET_AUTHORITY", stepId: s.contractId, authority: a }}>
          Save authority
        </ActionButton>
      ) : null}
      <p className="small muted">AI may prepare or recommend; authorization stays with the named human role. Connectivity never confers authority.</p>
    </div>
  );
}

function TechnicalEditor({ step: s, locked }: { step: WorkflowStep; locked: boolean }) {
  const [impl, setImpl] = useState(s.implementation);
  const list = (v: string[]) => v.join(", ");
  const split = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="label">As-built (current state)</div>
      <div className="field">
        <label>Assessment</label>
        <select disabled={locked} value={impl.currentState.assessmentStatus} onChange={(e) => setImpl({ ...impl, currentState: { ...impl.currentState, assessmentStatus: e.target.value as typeof impl.currentState.assessmentStatus } })}>
          {["UNASSESSED", "NO_CURRENT_CAPABILITY", "PARTIAL_CAPABILITY", "FULL_CAPABILITY", "TO_CONFIRM"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Summary</label>
        <textarea disabled={locked} value={impl.currentState.summary} onChange={(e) => setImpl({ ...impl, currentState: { ...impl.currentState, summary: e.target.value } })} style={{ minHeight: 44 }} />
      </div>
      <div className="field">
        <label>Existing services (comma separated)</label>
        <input disabled={locked} value={list(impl.currentState.services)} onChange={(e) => setImpl({ ...impl, currentState: { ...impl.currentState, services: split(e.target.value) } })} />
      </div>
      <div className="label" style={{ marginTop: 6 }}>
        Target treatment
      </div>
      <div className="field">
        <label>Treatment</label>
        <select disabled={locked} value={impl.targetState.treatment} onChange={(e) => setImpl({ ...impl, targetState: { ...impl.targetState, treatment: e.target.value as typeof impl.targetState.treatment } })}>
          {IMPLEMENTATION_TREATMENTS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Rationale</label>
        <input disabled={locked} value={impl.targetState.rationale} onChange={(e) => setImpl({ ...impl, targetState: { ...impl.targetState, rationale: e.target.value } })} />
      </div>
      <div className="field">
        <label>Target services</label>
        <input disabled={locked} value={list(impl.targetState.services)} onChange={(e) => setImpl({ ...impl, targetState: { ...impl.targetState, services: split(e.target.value) } })} />
      </div>
      <div className="field">
        <label>DO NOT REPLACE</label>
        <input disabled={locked} value={list(impl.targetState.doNotReplace)} onChange={(e) => setImpl({ ...impl, targetState: { ...impl.targetState, doNotReplace: split(e.target.value) } })} />
      </div>
      <div className="field">
        <label>Dependencies</label>
        <input disabled={locked} value={list(impl.targetState.dependencies)} onChange={(e) => setImpl({ ...impl, targetState: { ...impl.targetState, dependencies: split(e.target.value) } })} />
      </div>
      <div className="label" style={{ marginTop: 6 }}>
        ARB
      </div>
      <div className="row">
        <select disabled={locked} value={impl.arbImpact.reviewRequired} onChange={(e) => setImpl({ ...impl, arbImpact: { ...impl.arbImpact, reviewRequired: e.target.value as typeof impl.arbImpact.reviewRequired } })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4 }}>
          {["TBD", "NONE", "REQUIRED"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input disabled={locked} placeholder="Reason / topics" value={impl.arbImpact.reason} onChange={(e) => setImpl({ ...impl, arbImpact: { ...impl.arbImpact, reason: e.target.value, topics: split(e.target.value) } })} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 4, padding: 4 }} />
      </div>
      {!locked ? (
        <ActionButton actionType="UPDATE_BLUEPRINT" variant="primary" payload={{ op: "SET_IMPLEMENTATION", stepId: s.contractId, implementation: impl }}>
          Save implementation assessment
        </ActionButton>
      ) : null}
      <p className="small muted">Logical capability never implies a new deployable service. KEEP / REUSE components are preserved unless authoritative design changes the treatment.</p>
    </div>
  );
}
