import { NextResponse, after } from "next/server";
import { ActionError } from "@/lib/factory/actions";
import type { Actor } from "@/lib/factory/schema";
import { SPECIALIST_IDS, type SpecialistId } from "@/lib/factory/specialists/contracts";
import { executeSpecialist, queueSpecialist } from "@/lib/factory/specialists/runner";

export const dynamic = "force-dynamic";
// Pro plan maximum with Fluid Compute. The model call runs after the response is sent, bounded by this.
export const maxDuration = 800;

/**
 * Queue a stateless AI specialist as a governed job. Responds as soon as the job is queued;
 * the model call continues after the response and records its outcome on the job.
 * Clients poll GET /api/engagements/{id}/jobs/{jobId}.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await req.json()) as { specialistId: SpecialistId; task?: string; actor: Actor };
    if (!SPECIALIST_IDS.includes(body.specialistId)) return NextResponse.json({ ok: false, code: "INVALID_REQUEST", error: "Unknown specialist" }, { status: 400 });
    const task = body.task ?? "DEFAULT";
    const q = await queueSpecialist(id, body.specialistId, body.actor, task);
    const manifest = { manifestId: q.manifest.manifestId, sufficiency: q.manifest.sufficiency, sufficiencyDetail: q.manifest.sufficiencyDetail, sectionsIncluded: q.manifest.sectionsIncluded, approxTokens: q.manifest.approxTokens };
    if (q.earlyResult) return NextResponse.json({ ok: false, queued: false, status: q.earlyResult.status, jobId: q.jobId, error: q.earlyResult.error, manifest });
    after(async () => {
      try {
        await executeSpecialist(id, q.jobId, q.manifest, body.specialistId, body.actor, task);
      } catch (e) {
        console.error(`[specialist] ${q.jobId} crashed after response:`, e);
      }
    });
    return NextResponse.json({ ok: true, queued: true, status: "QUEUED", jobId: q.jobId, manifest });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, code: "INTERNAL", error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
