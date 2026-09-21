"use client";

import Link from "next/link";
import { ActionButton } from "./action-client";
import { useActor } from "./actor";
import type { NextHumanAction } from "@/lib/factory/schema";

/** One dominant next action, with a direct button when the action is a simple governed call. */
export function NextActionCard({ action, stageLabel }: { action: NextHumanAction; stageLabel: string }) {
  const { actor } = useActor();
  const allowed = action.allowedRoles.includes(actor.role);
  const direct = ["ADVANCE_STAGE", "EVALUATE_GATE", "ASSESS_EVIDENCE", "SUBMIT_FOR_REVIEW", "GENERATE_BUILD_CONTRACT", "RUN_VALIDATION", "GENERATE_EXPERIENCE", "RESUME_JOB"] as const;
  const isDirect = (direct as readonly string[]).includes(action.actionType);
  return (
    <div className="next">
      <div className="label">Your next action · {stageLabel}</div>
      <h2>{action.title}</h2>
      <p>{action.detail}</p>
      <div className="row" style={{ marginTop: 12 }}>
        {isDirect ? (
          <ActionButton actionType={action.actionType as "ADVANCE_STAGE"} payload={action.actionType === "RESUME_JOB" ? { jobId: action.target?.id } : undefined} variant="primary" disabled={!allowed}>
            {action.title}
          </ActionButton>
        ) : (
          <Link href={action.route} className="btn primary">
            Go to {action.route.split("/").pop() || "workspace"}
          </Link>
        )}
        <span className="roles">Authorized: {action.allowedRoles.map((r) => r.replaceAll("_", " ").toLowerCase()).join(", ")}</span>
      </div>
      {!allowed ? <div className="roles">Your current role ({actor.role.replaceAll("_", " ").toLowerCase()}) is not authorized for this action. Persona selection is presentation only; the Control Plane enforces roles.</div> : null}
    </div>
  );
}
