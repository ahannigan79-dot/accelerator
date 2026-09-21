import { NextResponse } from "next/server";
import { ActionError } from "@/lib/factory/actions";
import { ingestPack, SAMPLE_PACKS } from "@/lib/factory/samples";
import type { Actor } from "@/lib/factory/schema";

export const dynamic = "force-dynamic";

/** Ingest a bundled sample intake pack as a new engagement. */
export async function POST(req: Request, { params }: { params: Promise<{ pack: string }> }) {
  const { pack } = await params;
  const def = SAMPLE_PACKS[pack];
  if (!def) return NextResponse.json({ ok: false, code: "NOT_FOUND", error: `Unknown sample pack ${pack}` }, { status: 404 });
  try {
    const body = (await req.json().catch(() => ({}))) as { actor?: Actor };
    const actor: Actor = body.actor ?? { userId: "c.rivera", role: "CONSULTANT" };
    const result = await ingestPack(def.dir, actor, `ENG-${pack.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}-${Date.now().toString(36).toUpperCase()}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: 400 });
    return NextResponse.json({ ok: false, code: "INTERNAL", error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
