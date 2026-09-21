"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useActor } from "./actor";
import type { SpecialistId } from "@/lib/factory/specialists/contracts";

/** Runs a stateless AI specialist as a governed job. The result lands as a pending decision with an attached recommendation. */
export function SpecialistButton({ specialistId, task = "DEFAULT", label }: { specialistId: SpecialistId; task?: string; label: string }) {
  const { actor } = useActor();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string | null>(null);
  const [engagementId] = useState(() => (typeof window !== "undefined" ? window.location.pathname.split("/")[2] : ""));
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button
          className="btn secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setOut(null);
            try {
              const res = await fetch(`/api/engagements/${engagementId}/specialists`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ specialistId, task, actor }) });
              const json = await res.json();
              setOut(json.ok ? `Recommendation ready: ${json.requestId} (${json.recommendationRef}) · context ${json.manifest.sufficiency} · ~${json.manifest.approxTokens} tokens · ${json.telemetry.latencyMs} ms` : `${json.status ?? "FAILED"}: ${json.error ?? "unknown"}${json.manifest ? ` · context ${json.manifest.sufficiency}` : ""}`);
              router.refresh();
            } catch (e) {
              setOut(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Running specialist…" : label}
        </button>
        <span className="small muted">Job → Context Manifest → model → recommendation → your decision</span>
      </div>
      {out ? <div className="small">{out}</div> : null}
    </div>
  );
}
