"use client";

/**
 * Persona selection is presentation, not authorization. The Control Plane checks the
 * role on every action; this picker only decides which actor the UI submits as.
 * In the enterprise target this comes from identity, never from a dropdown.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Actor, ActorRole } from "@/lib/factory/schema";

export const PERSONAS: Actor[] = [
  { userId: "c.rivera", role: "CONSULTANT", displayName: "C. Rivera · Consultant" },
  { userId: "d.okafor", role: "DELIVERY_LEAD", displayName: "D. Okafor · Delivery lead" },
  { userId: "m.chen", role: "CLIENT_BUSINESS_OWNER", displayName: "M. Chen · Client business owner" },
  { userId: "s.patel", role: "CLIENT_PROCESS_OWNER", displayName: "S. Patel · Client process owner" },
  { userId: "l.novak", role: "CLIENT_ARCHITECT", displayName: "L. Novak · Client architect" },
  { userId: "arb.chair", role: "ARB", displayName: "ARB chair" },
  { userId: "a.bello", role: "SECURITY_PRIVACY", displayName: "A. Bello · Security & privacy" },
  { userId: "r.haddad", role: "CLIENT_IT_OPERATIONS", displayName: "R. Haddad · Client IT operations" },
];

const Ctx = createContext<{ actor: Actor; setRole: (r: ActorRole) => void }>({ actor: PERSONAS[0], setRole: () => {} });

export function ActorProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<ActorRole>("CONSULTANT");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("factory.actorRole") as ActorRole | null;
      if (saved && PERSONAS.some((p) => p.role === saved)) setRoleState(saved);
    } catch {
      /* ignore */
    }
  }, []);
  const value = useMemo(
    () => ({
      actor: PERSONAS.find((p) => p.role === role) ?? PERSONAS[0],
      setRole: (r: ActorRole) => {
        setRoleState(r);
        try {
          window.localStorage.setItem("factory.actorRole", r);
        } catch {
          /* ignore */
        }
      },
    }),
    [role],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActor() {
  return useContext(Ctx);
}

export function ActorPicker() {
  const { actor, setRole } = useActor();
  return (
    <label className="row" style={{ gap: 6, fontSize: 12 }}>
      <span style={{ color: "#b9ddff" }}>Acting as</span>
      <select value={actor.role} onChange={(e) => setRole(e.target.value as ActorRole)} style={{ borderRadius: 4, border: "1px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.1)", color: "#fff", padding: "4px 6px", fontSize: 12 }}>
        {PERSONAS.map((p) => (
          <option key={p.role} value={p.role} style={{ color: "#16202b" }}>
            {p.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
