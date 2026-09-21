import { NextResponse } from "next/server";
import { buildDemoEngagement, DEMO_ENGAGEMENT_ID } from "@/lib/factory/seed";
import type { LifecycleStage } from "@/lib/factory/schema";
import { LIFECYCLE_STAGES } from "@/lib/factory/schema";
import { getStore } from "@/lib/factory/store";

export const dynamic = "force-dynamic";

/** (Re)create the synthetic demo engagement at a given stage. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { stage?: LifecycleStage };
  const stage = body.stage && LIFECYCLE_STAGES.includes(body.stage) ? body.stage : "TARGET_DESIGN";
  const rec = buildDemoEngagement(stage);
  await getStore().put(rec, null);
  await getStore().appendEvents(rec.state.engagement_id, rec.state.history.slice(-50));
  return NextResponse.json({ ok: true, engagementId: DEMO_ENGAGEMENT_ID, stage: rec.state.currentStage, stateRevision: rec.state.stateRevision });
}
