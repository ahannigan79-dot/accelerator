"use client";

/**
 * Client-side bridge to the Governed Action API. The UI never writes state directly;
 * every button posts an ActionRequest with the expected revision and the acting role.
 */

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { ActionType } from "@/lib/factory/actions";
import type { TargetObject } from "@/lib/factory/schema";
import { useActor } from "./actor";

interface Bridge {
  run: (actionType: ActionType, payload?: Record<string, unknown>, opts?: { targetObject?: TargetObject; reason?: string }) => Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }>;
  busy: boolean;
  revision: number;
}

const Ctx = createContext<Bridge>({ run: async () => ({ ok: false, message: "no bridge" }), busy: false, revision: 0 });

export function ActionProvider({ engagementId, revision, children }: { engagementId: string; revision: number; children: ReactNode }) {
  const { actor } = useActor();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  const run = useCallback<Bridge["run"]>(
    async (actionType, payload, opts) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/engagements/${engagementId}/actions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actionType, payload, targetObject: opts?.targetObject, reason: opts?.reason, actor, expectedStateRevision: revision }),
        });
        const json = (await res.json()) as { ok: boolean; message?: string; error?: string; code?: string; data?: Record<string, unknown> };
        const message = json.ok ? json.message ?? "Done" : `${json.code ?? "ERROR"}: ${json.error ?? "failed"}`;
        setToast({ text: message, error: !json.ok });
        setTimeout(() => setToast(null), json.ok ? 3500 : 7000);
        if (json.ok) router.refresh();
        return { ok: json.ok, message, data: json.data };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setToast({ text: message, error: true });
        return { ok: false, message };
      } finally {
        setBusy(false);
      }
    },
    [actor, engagementId, revision, router],
  );
  return (
    <Ctx.Provider value={{ run, busy, revision }}>
      {children}
      {toast ? <div className={`toast${toast.error ? " error" : ""}`}>{toast.text}</div> : null}
    </Ctx.Provider>
  );
}

export function useAction() {
  return useContext(Ctx);
}

export function ActionButton({ actionType, payload, targetObject, reason, children, variant = "", confirm, disabled, onDone }: { actionType: ActionType; payload?: Record<string, unknown>; targetObject?: TargetObject; reason?: string; children: ReactNode; variant?: "" | "primary" | "secondary" | "warn" | "danger"; confirm?: string; disabled?: boolean; onDone?: (r: { ok: boolean; data?: Record<string, unknown> }) => void }) {
  const { run, busy } = useAction();
  return (
    <button
      className={`btn ${variant}`}
      disabled={busy || disabled}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        const r = await run(actionType, payload, { targetObject, reason });
        onDone?.(r);
      }}
    >
      {children}
    </button>
  );
}
