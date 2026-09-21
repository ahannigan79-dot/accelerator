import { NextResponse } from "next/server";
import { ActionError } from "@/lib/factory/actions";
import { startEngagement } from "@/lib/factory/service";
import { getStore } from "@/lib/factory/store";
import type { Actor } from "@/lib/factory/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, engagements: await getStore().list() });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { clientName: string; engagementName: string; workflowName: string; consultantName: string; clientObjective?: string; industry?: string; actor?: Actor };
    for (const k of ["clientName", "engagementName", "workflowName", "consultantName"] as const) if (!body[k]?.trim()) return NextResponse.json({ ok: false, code: "INVALID_REQUEST", error: `${k} is required` }, { status: 400 });
    const actor: Actor = body.actor ?? { userId: body.consultantName, role: "CONSULTANT" };
    const rec = await startEngagement({ clientName: body.clientName, engagementName: body.engagementName, workflowName: body.workflowName, consultantName: body.consultantName, clientObjective: body.clientObjective, industry: body.industry }, actor);
    return NextResponse.json({ ok: true, engagementId: rec.state.engagement_id, nextHumanAction: rec.runtime.nextHumanAction });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, code: "INTERNAL", error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
