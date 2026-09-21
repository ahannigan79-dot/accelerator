"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActionButton } from "./action-client";
import { useActor } from "./actor";
import type { NextHumanAction } from "@/lib/factory/schema";

/** One dominant next action, with a direct button when the action is a simple governed call. */
export function NextActionCard({ action, stageLabel, compact = false }: { action: NextHumanAction; stageLabel: string; compact?: boolean }) {
  const { actor } = useActor();
  const path = usePathname();
  const allowed = action.allowedRoles.includes(actor.role);
  const direct = ["ADVANCE_STAGE", "EVALUATE_GATE", "ASSESS_EVIDENCE", "SUBMIT_FOR_REVIEW", "GENERATE_BUILD_CONTRACT", "RUN_VALIDATION", "GENERATE_EXPERIENCE", "RESUME_JOB"] as const;
  const isDirect = (direct as readonly string[]).includes(action.actionType);
  const here = path === action.route;
  const hereHint: Record<string, string> = {
    RUN_SPECIALIST: "Use the AI specialist panel on this page.",
    UPDATE_BLUEPRINT: "Select a step on the canvas below; confirm its structure in the inspector, or confirm all at once from the completion panel.",
    SET_ENTERPRISE_CONTEXT: "Review the entries below, then confirm as the client architect.",
    DECIDE: "Open the decision below.",
    UPLOAD_EVIDENCE: "Use the upload panel on this page.",
    RESOLVE_CONTRADICTION: "Use the contradiction resolver on this page.",
  };
  return (
    <div className={`next${compact ? " compact" : ""}`}>
      <div className="label">Your next action · {stageLabel}</div>
      <h2>{action.title}</h2>
      <p>{action.detail}</p>
      <div className="row" style={{ marginTop: 12 }}>
        {isDirect ? (
          <ActionButton actionType={action.actionType as "ADVANCE_STAGE"} payload={action.actionType === "RESUME_JOB" ? { jobId: action.target?.id } : undefined} variant="primary" disabled={!allowed}>
            {action.title}
          </ActionButton>
        ) : here ? (
          <span className="roles" style={{ marginTop: 0 }}>{hereHint[action.actionType] ?? "This page is where the action happens."}</span>
        ) : (
          <Link href={action.route} className="btn primary">
            Go to {action.route.split("/").pop() || "overview"}
          </Link>
        )}
        <span className="roles">Authorized: {action.allowedRoles.map((r) => r.replaceAll("_", " ").toLowerCase()).join(", ")}</span>
      </div>
      {!allowed ? <div className="roles">Your current role ({actor.role.replaceAll("_", " ").toLowerCase()}) is not authorized for this action. Persona selection is presentation only; the Control Plane enforces roles.</div> : null}
    </div>
  );
}
