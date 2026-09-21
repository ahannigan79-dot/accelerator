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

export function ModeNav({ id }: { id: string }) {
  const path = usePathname();
  const base = `/engagements/${id}`;
  return (
    <nav className="modebar">
      {MODES.map(([suffix, label]) => {
        const href = `${base}${suffix}`;
        const active = suffix === "" ? path === base : path.startsWith(href);
        return (
          <Link key={suffix} href={href} className={active ? "active" : ""}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
