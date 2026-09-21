import Link from "next/link";
import type { ReactNode } from "react";

export function Badge({ tone = "", children }: { tone?: "" | "green" | "amber" | "red" | "blue" | "purple" | "accent"; children: ReactNode }) {
  return <span className={`badge${tone ? ` b-${tone}` : ""}`}>{children}</span>;
}

export function statusTone(s: string): "" | "green" | "amber" | "red" | "blue" | "purple" | "accent" {
  const u = String(s).toUpperCase();
  if (["PASS", "SUFFICIENT", "CONFIRMED", "COMPLETE", "APPROVED", "CURRENT_AUTHORITATIVE", "SAFE", "END_TO_END_VERIFIED", "RESOLVED", "VERIFIED", "CLIENT_CONFIRMED", "SOURCE_SUPPORTED", "CONFIRMS_DESIGN", "OK"].includes(u)) return "green";
  if (["CONDITIONAL", "PARTIAL", "TO_CONFIRM", "OPEN", "PENDING", "REVIEW_READY", "IN_REVIEW", "APPROVAL_PENDING", "CHECKPOINTED", "UNCOMMITTED_WORK", "REQUIRED", "NOT_ASSESSED", "UNSURE", "TBD", "CHANGES_REQUESTED", "CORRECTION_REQUIRED", "QUEUED", "RUNNING", "IN_PROGRESS", "DISPUTED", "UNCONFIRMED"].includes(u)) return "amber";
  if (["BLOCKED", "FAIL", "FAILED", "REJECTED", "QUARANTINED", "INTERRUPTED", "INTERRUPTED_JOBS", "GAP", "NEEDS_CHANGE", "BLOCKED_INPUT", "EXPIRED", "REVOKED"].includes(u)) return "red";
  if (["SYNTHETIC_SIMULATION", "REFERENCE_ONLY", "REVIEW_SNAPSHOT", "AI_GENERATED", "AI_SPECIALIST"].includes(u)) return "purple";
  if (["WAIVED", "NOT_APPLICABLE", "SUPERSEDED", "DERIVED"].includes(u)) return "blue";
  return "";
}

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={statusTone(value)}>{String(value).replaceAll("_", " ")}</Badge>;
}

export function Panel({ label, right, children, className = "" }: { label: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-label">
        <span>{label}</span>
        {right}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "green" | "amber" | "red" | "" }) {
  const color = tone === "green" ? "var(--green)" : tone === "amber" ? "var(--amber)" : tone === "red" ? "var(--red)" : undefined;
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="metric" style={{ color }}>
        {value}
      </div>
      {sub ? <div className="small">{sub}</div> : null}
    </div>
  );
}

export function Note({ tone = "", children }: { tone?: "" | "warn" | "danger" | "purple"; children: ReactNode }) {
  return <div className={`note ${tone}`}>{children}</div>;
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v ?? <span className="muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LinkButton({ href, children, variant = "" }: { href: string; children: ReactNode; variant?: "" | "primary" | "secondary" }) {
  return (
    <Link href={href} className={`btn ${variant}`}>
      {children}
    </Link>
  );
}

export function fmtDate(iso?: string) {
  if (!iso) return "";
  return iso.slice(0, 16).replace("T", " ");
}
