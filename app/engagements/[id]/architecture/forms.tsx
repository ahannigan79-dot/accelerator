"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-client";
import { SpecialistButton } from "@/components/specialist-button";
import { Badge, Panel, StatusBadge } from "@/components/ui";
import { READINESS_LIFECYCLE, type IntegrationContract, type ReadinessState } from "@/lib/factory/integration";
import type { ITObservability } from "@/lib/factory/schema";

export function IntegrationRow({ integration: i, evidence }: { integration: IntegrationContract; evidence: { evidenceRef: string; title: string; synthetic: boolean }[] }) {
  const idx = READINESS_LIFECYCLE.indexOf(i.readiness);
  const next = READINESS_LIFECYCLE[idx + 1] as ReadinessState | undefined;
  const needsEvidence = next && ["CONNECTED", "CONTRACT_TESTED", "END_TO_END_VERIFIED"].includes(next);
  const [ref, setRef] = useState("");
  return (
    <tr>
      <td>
        <b>{i.integrationId}</b> {i.name}
        <div className="small muted">
          {i.system} · {i.workflowStepIds.join(", ")} · <StatusBadge value={i.requirementStatus} /> <Badge tone={i.mockability.startsWith("REAL") ? "amber" : ""}>{i.mockability.replaceAll("_", " ").toLowerCase()}</Badge>
        </div>
      </td>
      <td className="small">
        <div><b>Need:</b> {i.businessNeed}</div>
        <div><b>Logical:</b> {i.logicalContract}</div>
        <div><b>Physical:</b> {i.physicalRealization}</div>
        <div><b>Runtime:</b> {i.runtimeVerification}</div>
      </td>
      <td className="small">
        {i.modes.join(" / ")}
        {i.modes.includes("WRITE") ? (
          <div className="muted">
            {i.writeAuthority ? (
              <>
                prepare {String(i.writeAuthority.aiMayPrepare)} · initiate {String(i.writeAuthority.aiMayInitiate)} · exec {i.writeAuthority.executionPermission} · human {i.writeAuthority.humanBusinessAuthority}
              </>
            ) : (
              <span style={{ color: "var(--red)" }}>write authority undefined</span>
            )}
          </div>
        ) : null}
      </td>
      <td>
        <StatusBadge value={i.readiness} />
        <div className="small muted">{i.readinessHistory.length} transition(s)</div>
        {next ? (
          <div className="stack" style={{ gap: 4, marginTop: 4 }}>
            {needsEvidence ? (
              <select value={ref} onChange={(e) => setRef(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 3, fontSize: 11, maxWidth: 220 }}>
                <option value="">Evidence for {next.toLowerCase()}…</option>
                {evidence.map((e) => (
                  <option key={e.evidenceRef} value={e.evidenceRef}>
                    {e.evidenceRef} {e.synthetic ? "(synthetic)" : ""} {e.title.slice(0, 30)}
                  </option>
                ))}
              </select>
            ) : null}
            <ActionButton actionType="UPDATE_INTEGRATION" variant="secondary" disabled={needsEvidence && !ref} payload={{ integrationId: i.integrationId, readiness: next, evidenceRef: ref || undefined }}>
              → {next.replaceAll("_", " ").toLowerCase()}
            </ActionButton>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

export function ArchitectureActions(props: { kind: "panel"; stage: string; hasContract: boolean; hasDesign: boolean; observability: ITObservability } | { kind: "answer"; decisionKey: string }) {
  const [rationale, setRationale] = useState("");
  if (props.kind === "answer") {
    return (
      <div className="row">
        <input placeholder="Resolution" value={rationale} onChange={(e) => setRationale(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 4, padding: 4, fontSize: 11, width: 160 }} />
        <ActionButton actionType="DECIDE" variant="primary" disabled={!rationale.trim()} payload={{ type: "ANSWER", target: { type: "DECISION", id: props.decisionKey }, rationale }}>
          Answer
        </ActionButton>
      </div>
    );
  }
  const o = props.observability;
  return (
    <>
      <Panel label="Integration readiness">
        <div className="stack" style={{ gap: 8 }}>
          <SpecialistButton specialistId="INTEGRATION_READINESS" label={props.hasContract ? "Re-derive integration contracts" : "Derive Integration & Data Contract"} />
          <p className="small muted">The specialist separates business need, logical contract, physical realization and runtime verification. Readiness never exceeds CLIENT_CONFIRMED without evidence.</p>
        </div>
      </Panel>
      <Panel label="Technical compiler">
        <div className="stack" style={{ gap: 8 }}>
          <ActionButton actionType="COMPILE_TECHNICAL_DESIGN" variant="primary" disabled={!["TECHNICAL_DESIGN", "TRANSFORMATION_PLANNING", "BUILD_CONTRACT"].includes(props.stage)}>
            {props.hasDesign ? "Recompile technical design" : "Compile technical design"}
          </ActionButton>
          <SpecialistButton specialistId="TECHNICAL_COMPILER" label="AI enrichment (architecture notes)" />
          <p className="small muted">Deterministic compile from the design contract; AI enrichment is attached as notes and recorded as a recommendation.</p>
        </div>
      </Panel>
      <Panel label="Observability alignment" right={<StatusBadge value={o.inheritsClientEcosystem ? "OK" : "TO_CONFIRM"} />}>
        <ObservabilityForm o={o} />
      </Panel>
    </>
  );
}

function ObservabilityForm({ o }: { o: ITObservability }) {
  const [f, setF] = useState(o);
  const keys: (keyof ITObservability)[] = ["loggingPlatform", "tracingPlatform", "metricsPlatform", "alertingPlatform", "siemPlatform", "incidentProcess"];
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="small row">
        <input type="checkbox" checked={f.inheritsClientEcosystem} onChange={(e) => setF({ ...f, inheritsClientEcosystem: e.target.checked })} /> Reuse the client-approved ecosystem (default)
      </label>
      {keys.map((k) => (
        <div className="field" key={k}>
          <label>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</label>
          <input value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
        </div>
      ))}
      <ActionButton actionType="SET_OBSERVABILITY" variant="secondary" payload={{ observability: f }} reason={f.inheritsClientEcosystem ? undefined : "Parallel telemetry platform decision"}>
        Save
      </ActionButton>
      <p className="small muted">A new parallel telemetry platform requires an explicit architecture decision by a client architect or ARB.</p>
    </div>
  );
}
