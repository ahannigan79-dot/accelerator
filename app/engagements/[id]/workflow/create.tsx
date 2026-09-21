"use client";

import { ActionButton } from "@/components/action-client";
import { SpecialistButton } from "@/components/specialist-button";
import { Panel } from "@/components/ui";

export function CreateBlueprint({ stage }: { stage: string }) {
  return (
    <div className="grid grid-2">
      <Panel label="AI specialist · Blueprint">
        <p className="small" style={{ marginBottom: 8 }}>
          <b>Step 1 · Structure.</b> Reconstructs the {stage === "TARGET_DESIGN" ? "target" : "current-state"} phases, lanes and steps from the evidence catalog. Nothing else: steps arrive OPEN, you confirm them, then step 2 enriches only confirmed steps with rules, checks and human actions.
        </p>
        <SpecialistButton specialistId="BLUEPRINT" task="STRUCTURE" label="Draft workflow structure from evidence" />
        <p className="small muted" style={{ margin: "12px 0 8px" }}>
          One-pass alternative: structure and detail in a single larger draft. Faster to a full picture, but every rule and action arrives before the skeleton is agreed.
        </p>
        <SpecialistButton specialistId="BLUEPRINT" label="Draft full blueprint in one pass" />
      </Panel>
      <Panel label="Author directly">
        <p className="small" style={{ marginBottom: 8 }}>
          Start an empty canvas with a default phase and add steps by hand.
        </p>
        <ActionButton actionType="UPDATE_BLUEPRINT" variant="primary" payload={{ op: "CREATE_EMPTY", phases: [{ key: "intake", name: "Intake", desc: "" }, { key: "process", name: "Process", desc: "" }, { key: "decide", name: "Decide", desc: "" }, { key: "close", name: "Close", desc: "" }] }}>
          Create empty blueprint
        </ActionButton>
      </Panel>
    </div>
  );
}
