"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MODES: [string, string][] = [
  ["", "Overview"],
  ["/workflow", "Workflow"],
  ["/evidence", "Evidence"],
  ["/decisions", "Decisions"],
  ["/experience", "Experience"],
  ["/architecture", "Architecture"],
  ["/plan", "Plan"],
  ["/build", "Build"],
  ["/validate", "Validate"],
  ["/simulate", "Simulate"],
  ["/lineage", "Lineage"],
];

/**
 * Horizontal axis: working surfaces over the same authoritative state. Users move freely between them.
 * The stage rail (vertical) is not navigation; it advances only through governed actions.
 */
export function ModeNav({ id, nextRoute, nextTitle }: { id: string; nextRoute?: string; nextTitle?: string }) {
  const path = usePathname();
  const base = `/engagements/${id}`;
  return (
    <nav className="modebar">
      <span className="axis-label">Work in</span>
      {MODES.map(([suffix, label]) => {
        const href = `${base}${suffix}`;
        const active = suffix === "" ? path === base : path.startsWith(href);
        const isNext = !!nextRoute && (suffix === "" ? nextRoute === base : nextRoute.startsWith(href));
        return (
          <Link key={suffix} href={href} className={`${active ? "active" : ""}${isNext ? " next" : ""}`} title={isNext ? `Next action: ${nextTitle ?? ""}` : undefined}>
            {label}
            {isNext ? <span className="next-dot" aria-label="next action here" /> : null}
          </Link>
        );
      })}
      {nextRoute ? <span className="axis-hint">● marks where the next action is</span> : null}
    </nav>
  );
}
