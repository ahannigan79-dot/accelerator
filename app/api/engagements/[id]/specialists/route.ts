import { NextResponse } from "next/server";
import { ActionError } from "@/lib/factory/actions";
import type { Actor } from "@/lib/factory/schema";
import { SPECIALIST_IDS, type SpecialistId } from "@/lib/factory/specialists/contracts";
import { runSpecialist } from "@/lib/factory/specialists/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Run a stateless AI specialist as a governed job. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await req.json()) as { specialistId: SpecialistId; task?: string; actor: Actor };
    if (!SPECIALIST_IDS.includes(body.specialistId)) return NextResponse.json({ ok: false, code: "INVALID_REQUEST", error: "Unknown specialist" }, { status: 400 });
    const result = await runSpecialist(id, body.specialistId, body.actor, body.task ?? "DEFAULT");
    return NextResponse.json({ ok: result.status === "COMPLETE", status: result.status, jobId: result.jobId, requestId: result.requestId, recommendationRef: result.recommendationRef, error: result.error, manifest: { manifestId: result.manifest.manifestId, sufficiency: result.manifest.sufficiency, sufficiencyDetail: result.manifest.sufficiencyDetail, sectionsIncluded: result.manifest.sectionsIncluded, approxTokens: result.manifest.approxTokens }, telemetry: result.telemetry });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, code: "INTERNAL", error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
