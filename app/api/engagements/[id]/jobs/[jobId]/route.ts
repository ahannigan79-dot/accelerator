import { NextResponse } from "next/server";
import { getStore } from "@/lib/factory/store";

export const dynamic = "force-dynamic";

/** Job status for polling clients. Reads authoritative state only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await params;
  const rec = await getStore().get(id);
  if (!rec) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Engagement not found" }, { status: 404 });
  const job = rec.state.jobs.find((j) => j.jobId === jobId);
  if (!job) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: "Job not found" }, { status: 404 });
  const request = rec.state.pendingHumanDecisions.find((p) => p.recommendation && job.resultArtifactRefs.length && rec.state.authoritativeArtifacts.some((a) => job.resultArtifactRefs.includes(a.artifactId) && a.contentKey === `recommendation:${p.recommendation!.recommendationRef}`));
  return NextResponse.json({ ok: true, job: { jobId: job.jobId, status: job.status, error: job.error, telemetry: job.telemetry, queuedAt: job.queuedAt, updatedAt: job.updatedAt, specialistId: job.specialistId }, requestId: request?.requestId, recommendationRef: request?.recommendation?.recommendationRef, stateRevision: rec.state.stateRevision });
}
