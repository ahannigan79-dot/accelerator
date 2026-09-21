import { NextResponse } from "next/server";
import { ActionError } from "@/lib/factory/actions";
import { continueFromState } from "@/lib/factory/service";

export const dynamic = "force-dynamic";

/** Continue from state: returns authoritative State + a freshly regenerated Runtime projection. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const rec = await continueFromState(id);
    return NextResponse.json({ ok: true, regenerated: rec.regenerated, runtime: rec.runtime, state: rec.state });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: 404 });
    return NextResponse.json({ ok: false, code: "INTERNAL", error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
