"use client";

import { ActionButton } from "@/components/action-client";

/**
 * Close out jobs that lost their worker (for example a function cut off mid-call).
 * A specialist job cannot be resumed from a checkpoint because the model call is atomic; it is failed and re-run.
 */
export function JobControls({ job }: { job: { jobId: string; status: string; jobType: string; updatedAt: string } }) {
  const stale = (Date.now() - new Date(job.updatedAt).getTime()) / 60000;
  if (!["RUNNING", "QUEUED", "INTERRUPTED", "CHECKPOINTED"].includes(job.status)) return null;
  const specialist = job.jobType === "SPECIALIST_RUN";
  return (
    <div className="row" style={{ marginTop: 4 }}>
      {specialist ? (
        <ActionButton actionType="FAIL_JOB" variant="warn" payload={{ jobId: job.jobId, error: `Closed by operator after ${Math.round(stale)} min without a result (worker lost)` }} confirm={`Mark ${job.jobId} as failed? Re-run the specialist afterwards to get a fresh result.`}>
          Mark failed
        </ActionButton>
      ) : job.status === "RUNNING" || job.status === "QUEUED" ? (
        <ActionButton actionType="INTERRUPT_JOB" variant="warn" payload={{ jobId: job.jobId }} reason="Closed by operator: worker lost">
          Mark interrupted
        </ActionButton>
      ) : (
        <ActionButton actionType="RESUME_JOB" variant="secondary" payload={{ jobId: job.jobId }}>
          Resume
        </ActionButton>
      )}
      {stale > 15 && ["RUNNING", "QUEUED"].includes(job.status) ? <span className="small" style={{ color: "var(--amber)" }}>No update for {Math.round(stale)} min — the worker was probably lost.</span> : null}
    </div>
  );
}
