"use client";

import { ActionButton } from "@/components/action-client";
import { Panel } from "@/components/ui";

export function OverviewActions() {
  return (
    <Panel label="Control plane">
      <div className="row">
        <ActionButton actionType="EVALUATE_GATE" variant="secondary">
          Evaluate gates
        </ActionButton>
        <ActionButton actionType="ASSESS_EVIDENCE">Reassess evidence</ActionButton>
        <ActionButton actionType="CHECKPOINT" payload={{ note: "Manual checkpoint" }}>
          Checkpoint
        </ActionButton>
        <ActionButton actionType="ADVANCE_STAGE" variant="primary" confirm="Advance to the next lifecycle stage? The Control Plane will re-evaluate the gate first.">
          Advance stage
        </ActionButton>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Every button posts a governed action with the expected state revision. Stale or unauthorized requests are rejected.
      </p>
    </Panel>
  );
}
