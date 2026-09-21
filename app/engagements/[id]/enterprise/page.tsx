import { notFound } from "next/navigation";
import { NextActionCard } from "@/components/next-action";
import { Badge, Note, Panel, StatusBadge, fmtDate } from "@/components/ui";
import { enterpriseEntryCount, getEnterpriseContext } from "@/lib/factory/content";
import { STAGE_LABELS } from "@/lib/factory/lifecycle";
import { getStore } from "@/lib/factory/store";
import { EnterpriseEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function Enterprise({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state, runtime } = rec;
  const ec = getEnterpriseContext(state);
  const count = enterpriseEntryCount(ec);
  const evidence = state.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT").map((e) => ({ evidenceRef: e.evidenceRef, title: e.title }));
  return (
    <>
      <div className="row spread">
        <div>
          <h1>Enterprise context</h1>
          <div className="small muted">
            The client&apos;s landscape, grounded before any workflow is designed on it: standards, systems, integration patterns, data domains, security and compliance constraints, AI policy.
            {count ? <> · v{ec.version} · {count} entries · updated {fmtDate(ec.updatedAt)}</> : null}
          </div>
        </div>
        <div className="row">
          <StatusBadge value={ec.reviewStatus} />
          {ec.confirmedBy ? <Badge tone="green">confirmed by {ec.confirmedBy.actor.role.replaceAll("_", " ").toLowerCase()} · {ec.confirmedBy.decisionId}</Badge> : null}
        </div>
      </div>
      <div className="section">
        <NextActionCard action={runtime.nextHumanAction} stageLabel={STAGE_LABELS[state.currentStage]} compact />
      </div>
      {state.currentStage === "DISCOVERY" ? (
        <div className="section">
          <Note tone={ec.reviewStatus === "CONFIRMED" ? "" : "warn"}>
            {ec.reviewStatus === "CONFIRMED" ? "Confirmed. Baseline design can start; the Blueprint specialist receives this context and must name systems, integrations and data owners exactly as recorded here." : "Discovery cannot close until the client architect confirms this context. Editing any entry reopens it."}
          </Note>
        </div>
      ) : null}
      {!evidence.length ? (
        <div className="section">
          <Panel label="No evidence yet">
            <p className="small">Upload the client&apos;s architecture standards, integration diagrams, system inventories and data ownership material on the Evidence page. The specialist drafts this context only from evidence in the catalog.</p>
          </Panel>
        </div>
      ) : null}
      <div className="section">
        <EnterpriseEditor context={ec} evidence={evidence} locked={false} hasEvidence={evidence.length > 0} />
      </div>
    </>
  );
}
