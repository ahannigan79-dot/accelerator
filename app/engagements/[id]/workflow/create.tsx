"use client";

import { ActionButton } from "@/components/action-client";
import { SpecialistButton } from "@/components/specialist-button";
import { Panel } from "@/components/ui";

export function CreateBlueprint({ stage }: { stage: string }) {
  return (
    <div className="grid grid-2">
      <Panel label="AI specialist · Blueprint">
        <p className="small" style={{ marginBottom: 8 }}>
          Reconstructs the {stage === "TARGET_DESIGN" ? "target" : "current-state"} workflow from the evidence catalog. Every step, rule, check and human action arrives OPEN for review.
        </p>
        <SpecialistButton specialistId="BLUEPRINT" label="Draft blueprint from evidence" />
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
