"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-client";
import { SpecialistButton } from "@/components/specialist-button";
import { Panel } from "@/components/ui";

export function PlanActions({ stage }: { stage: string }) {
  const [json, setJson] = useState("");
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = json.trim() ? JSON.parse(json) : null;
  } catch {
    parsed = null;
  }
  return (
    <>
      <Panel label="AI specialist · Transformation Planner">
        <SpecialistButton specialistId="TRANSFORMATION_PLANNER" label="Draft work-package plan" />
        <p className="small muted" style={{ marginTop: 6 }}>Human baseline first; AI adjustments per activity with rationale; floors preserved.</p>
      </Panel>
      <Panel label="Register plan (JSON)">
        <textarea value={json} onChange={(e) => setJson(e.target.value)} placeholder='{"workPackages":[...],"humanAdoptionPlan":[],"complianceRiskReadout":[]}' style={{ width: "100%", minHeight: 120, border: "1px solid var(--line)", borderRadius: 4, padding: 6, fontFamily: "var(--mono)", fontSize: 11 }} />
        <div className="row" style={{ marginTop: 6 }}>
          <ActionButton actionType="SET_TRANSFORMATION_PLAN" variant="primary" disabled={!parsed || stage !== "TRANSFORMATION_PLANNING"} payload={{ plan: parsed ?? {} }}>
            Register plan
          </ActionButton>
          {json && !parsed ? <span className="small" style={{ color: "var(--red)" }}>Invalid JSON</span> : null}
        </div>
      </Panel>
    </>
  );
}
