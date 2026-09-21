"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useActor } from "./actor";
import type { SpecialistId } from "@/lib/factory/specialists/contracts";

/**
 * Runs a stateless AI specialist as a governed job. The request returns as soon as the job is queued;
 * this component then polls the job until it completes, so a long model call never depends on a held-open connection.
 */
export function SpecialistButton({ specialistId, task = "DEFAULT", label }: { specialistId: SpecialistId; task?: string; label: string }) {
  const { actor } = useActor();
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "queuing" | "running" | "done" | "failed">("idle");
  const [out, setOut] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [engagementId] = useState(() => (typeof window !== "undefined" ? window.location.pathname.split("/")[2] : ""));
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  async function poll(jobId: string, startedAt: number) {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      setElapsed(Math.round((Date.now() - startedAt) / 1000));
      try {
        const res = await fetch(`/api/engagements/${engagementId}/jobs/${jobId}`, { cache: "no-store" });
        const json = await res.json();
        if (!json.ok) return;
        const j = json.job;
        if (j.status === "COMPLETE") {
          if (timer.current) clearInterval(timer.current);
          setPhase("done");
          setOut(`Recommendation ready: ${json.requestId ?? "see Decisions"} (${json.recommendationRef ?? ""}) · ${j.telemetry.modelCalls} call(s) · ${j.telemetry.inputTokens.toLocaleString()} in / ${j.telemetry.outputTokens.toLocaleString()} out tokens · ${Math.round(j.telemetry.latencyMs / 1000)} s${j.telemetry.retries ? ` · ${j.telemetry.retries} repair round(s)` : ""}`);
          router.refresh();
        } else if (j.status === "FAILED") {
          if (timer.current) clearInterval(timer.current);
          setPhase("failed");
          setOut(`FAILED: ${j.error ?? "unknown"}`);
          router.refresh();
        }
      } catch {
        /* transient; keep polling */
      }
    }, 5000);
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button
          className="btn secondary"
          disabled={phase === "queuing" || phase === "running"}
          onClick={async () => {
            setPhase("queuing");
            setOut(null);
            setElapsed(0);
            try {
              const res = await fetch(`/api/engagements/${engagementId}/specialists`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ specialistId, task, actor }) });
              const json = await res.json();
              if (!json.ok) {
                setPhase("failed");
                setOut(`${json.status ?? json.code ?? "FAILED"}: ${json.error ?? "unknown"}${json.manifest ? ` · context ${json.manifest.sufficiency}` : ""}`);
                router.refresh();
                return;
              }
              setPhase("running");
              setOut(`${json.jobId} queued · context ${json.manifest.sufficiency} · ~${json.manifest.approxTokens.toLocaleString()} tokens. You can leave this page; the job continues and the result lands on Decisions.`);
              router.refresh();
              poll(json.jobId, Date.now());
            } catch (e) {
              setPhase("failed");
              setOut(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          {phase === "queuing" ? "Queuing…" : phase === "running" ? `Running… ${elapsed}s` : label}
        </button>
        <span className="small muted">Job → Context Manifest → model → recommendation → your decision</span>
      </div>
      {out ? <div className="small" style={{ color: phase === "failed" ? "var(--red)" : undefined }}>{out}</div> : null}
    </div>
  );
}
