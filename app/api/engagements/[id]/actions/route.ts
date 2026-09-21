import { NextResponse } from "next/server";
import { ACTION_TYPES, ActionError, type ActionType } from "@/lib/factory/actions";
import { runAction } from "@/lib/factory/service";
import type { Actor, TargetObject } from "@/lib/factory/schema";

export const dynamic = "force-dynamic";

const STATUS: Record<ActionError["code"], number> = { INVALID_REQUEST: 400, STALE_REVISION: 409, UNAUTHORIZED: 403, PRECONDITION_FAILED: 422, NOT_FOUND: 404, ISOLATION: 403 };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await req.json()) as { actionType: ActionType; payload?: Record<string, unknown>; targetObject?: TargetObject; reason?: string; actor: Actor; expectedStateRevision?: number };
    if (!ACTION_TYPES.includes(body.actionType)) return NextResponse.json({ ok: false, code: "INVALID_REQUEST", error: `Unknown actionType ${String(body.actionType)}` }, { status: 400 });
    if (!body.actor?.userId || !body.actor?.role) return NextResponse.json({ ok: false, code: "INVALID_REQUEST", error: "actor required" }, { status: 400 });
    const result = await runAction(id, { actionType: body.actionType, payload: body.payload, targetObject: body.targetObject, reason: body.reason, actor: body.actor, expectedStateRevision: body.expectedStateRevision });
    return NextResponse.json({ ok: true, message: result.message, data: result.data, stateRevision: result.state.stateRevision, nextHumanAction: result.nextHumanAction, events: result.events.map((e) => e.summary) });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ ok: false, code: e.code, error: e.message }, { status: STATUS[e.code] });
    return NextResponse.json({ ok: false, code: "INTERNAL", error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
