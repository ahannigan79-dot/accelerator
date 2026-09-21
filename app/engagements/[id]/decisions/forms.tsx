"use client";

import { useState } from "react";
import { ActionButton, useAction } from "@/components/action-client";
import { useActor } from "@/components/actor";
import { Panel } from "@/components/ui";
import type { ActorRole, DecisionType, GateId, PendingHumanDecision, TargetDesignMode } from "@/lib/factory/schema";

export function GateDecisionForm({ gateId, approverRoles, outcome }: { gateId: GateId; approverRoles: ActorRole[]; outcome: string | null }) {
  const { actor } = useActor();
  const [rationale, setRationale] = useState("");
  const allowed = approverRoles.includes(actor.role);
  const target = { type: "GATE" as const, id: gateId };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field">
        <label>Rationale (recorded with the decision)</label>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why this decision is right for the engagement" />
      </div>
      <div className="row">
        <ActionButton actionType="EVALUATE_GATE" variant="secondary">
          Evaluate gate
        </ActionButton>
        <ActionButton actionType="DECIDE" variant="primary" disabled={!allowed || !rationale.trim()} payload={{ type: "APPROVE", target, rationale }}>
          Approve
        </ActionButton>
        <ActionButton actionType="DECIDE" variant="warn" disabled={!allowed || !rationale.trim() || outcome !== "CONDITIONAL"} payload={{ type: "ACCEPT_CONDITIONAL", target, rationale }}>
          Accept conditions
        </ActionButton>
        <ActionButton actionType="DECIDE" variant="warn" disabled={!allowed || !rationale.trim()} payload={{ type: "REQUEST_CHANGES", target, rationale }}>
          Request changes
        </ActionButton>
        <ActionButton actionType="DECIDE" variant="danger" disabled={!allowed || !rationale.trim()} payload={{ type: "REJECT", target, rationale }}>
          Reject
        </ActionButton>
      </div>
      {!allowed ? <p className="small muted">Only {approverRoles.map((r) => r.replaceAll("_", " ").toLowerCase()).join(" or ")} may decide on this gate. Your role: {actor.role.replaceAll("_", " ").toLowerCase()}.</p> : null}
    </div>
  );
}

export function PendingDecisionForm({ request }: { request: PendingHumanDecision }) {
  const { actor } = useActor();
  const [rationale, setRationale] = useState("");
  const allowed = request.allowedRoles.includes(actor.role);
  const types: DecisionType[] = request.recommendation ? [...new Set<DecisionType>(["ACCEPT_RECOMMENDATION", ...request.allowedTypes])] : request.allowedTypes;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field">
        <label>Rationale</label>
        <input value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Recorded with the decision" />
      </div>
      <div className="row">
        {types.map((t) => (
          <ActionButton key={t} actionType="DECIDE" variant={t === "REJECT" ? "danger" : t === "APPROVE" || t === "ACCEPT_RECOMMENDATION" || t === "ANSWER" || t === "CORRECT" ? "primary" : "warn"} disabled={!allowed || !rationale.trim()} payload={{ requestId: request.requestId, type: t, target: request.target, rationale, payload: t === "CORRECT" ? { conflictIndex: Number(request.target.id.split("#")[1] ?? 0) } : undefined }}>
            {t.replaceAll("_", " ").toLowerCase()}
          </ActionButton>
        ))}
      </div>
      {!allowed ? <p className="small muted">Authorized: {request.allowedRoles.map((r) => r.replaceAll("_", " ").toLowerCase()).join(", ")}.</p> : null}
    </div>
  );
}

export function DecisionForms({ requirements, openItems, currentStage, targetDesignMode }: { requirements: { requirementId: string; description: string; status: string; waiverAuthority: ActorRole[] }[]; openItems: { itemId: string; title: string }[]; currentStage: string; targetDesignMode: TargetDesignMode }) {
  const { actor } = useActor();
  const { run } = useAction();
  const [reqId, setReqId] = useState(requirements[0]?.requirementId ?? "");
  const [waiverReason, setWaiverReason] = useState("");
  const [expires, setExpires] = useState(() => new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10));
  const [itemId, setItemId] = useState(openItems[0]?.itemId ?? "");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<TargetDesignMode>("AI_NATIVE_REIMAGINED");
  const [pathReason, setPathReason] = useState("");
  const [raise, setRaise] = useState({ kind: "TO_CONFIRM", title: "", detail: "", owner: "" });
  const req = requirements.find((r) => r.requirementId === reqId);
  const canWaive = req ? req.waiverAuthority.includes(actor.role) : false;
  return (
    <>
      {currentStage === "TARGET_PATH_SELECTION" ? (
        <Panel label="Select target path">
          <p className="small" style={{ marginBottom: 8 }}>
            Exactly one mode, by explicit human decision. The Factory may recommend AI-native reimagination but never forces it. Current: <b>{targetDesignMode.replaceAll("_", " ")}</b>
          </p>
          <div className="row">
            <select value={mode} onChange={(e) => setMode(e.target.value as TargetDesignMode)} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }}>
              <option value="AI_NATIVE_REIMAGINED">AI-native reimagined</option>
              <option value="BASELINE_PRESERVED">Baseline preserved</option>
              <option value="CLIENT_DIRECTED">Client directed</option>
            </select>
            <input placeholder="Rationale" value={pathReason} onChange={(e) => setPathReason(e.target.value)} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
            <ActionButton actionType="DECIDE" variant="primary" disabled={!pathReason.trim()} payload={{ type: "SELECT_TARGET_PATH", target: { type: "TARGET_PATH", id: "target-path" }, rationale: pathReason, payload: { mode } }}>
              Select
            </ActionButton>
          </div>
        </Panel>
      ) : null}

      <Panel label="Waive or mark not applicable">
        <div className="form-grid">
          <div className="field">
            <label>Evidence requirement</label>
            <select value={reqId} onChange={(e) => setReqId(e.target.value)}>
              {requirements.map((r) => (
                <option key={r.requirementId} value={r.requirementId}>
                  {r.requirementId} · {r.description} ({r.status})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Waiver expires</label>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Rationale</label>
            <input value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <ActionButton actionType="DECIDE" variant="warn" disabled={!canWaive || !waiverReason.trim()} payload={{ type: "WAIVE", target: { type: "EVIDENCE_REQUIREMENT", id: reqId }, rationale: waiverReason, payload: { expiresAt: `${expires}T00:00:00.000Z`, reviewBy: `${expires}T00:00:00.000Z` } }}>
            Waive
          </ActionButton>
          <ActionButton actionType="DECIDE" variant="warn" disabled={!canWaive || !waiverReason.trim()} payload={{ type: "NOT_APPLICABLE", target: { type: "EVIDENCE_REQUIREMENT", id: reqId }, rationale: waiverReason }}>
            Mark not applicable
          </ActionButton>
          <span className="small muted">Authority: {req?.waiverAuthority.map((r) => r.replaceAll("_", " ").toLowerCase()).join(", ")}. Waivers are bound to this engagement, stage and gate and expire.</span>
        </div>
      </Panel>

      <Panel label="Answer an open item">
        <div className="row">
          <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6, maxWidth: 320 }}>
            {openItems.length ? openItems.map((o) => <option key={o.itemId} value={o.itemId}>{o.itemId} · {o.title}</option>) : <option value="">No open items</option>}
          </select>
          <input placeholder="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
          <ActionButton actionType="ANSWER_QUESTION" variant="primary" disabled={!itemId || !answer.trim()} payload={{ itemId, answer }} onDone={(r) => r.ok && setAnswer("")}>
            Record answer
          </ActionButton>
        </div>
      </Panel>

      <Panel label="Raise an item">
        <div className="row">
          <select value={raise.kind} onChange={(e) => setRaise({ ...raise, kind: e.target.value })} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 6 }}>
            {["TO_CONFIRM", "BLOCKER", "RISK", "QUESTION"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <input placeholder="Title" value={raise.title} onChange={(e) => setRaise({ ...raise, title: e.target.value })} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
          <input placeholder="Owner" value={raise.owner} onChange={(e) => setRaise({ ...raise, owner: e.target.value })} style={{ width: 160, border: "1px solid var(--line)", borderRadius: 4, padding: 6 }} />
          <button
            className="btn"
            disabled={!raise.title.trim()}
            onClick={async () => {
              const r = await run("RAISE_ITEM", raise);
              if (r.ok) setRaise({ kind: "TO_CONFIRM", title: "", detail: "", owner: "" });
            }}
          >
            Raise
          </button>
        </div>
      </Panel>
    </>
  );
}
