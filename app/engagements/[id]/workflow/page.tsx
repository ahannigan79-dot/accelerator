import { notFound } from "next/navigation";
import { NextActionCard } from "@/components/next-action";
import { Note } from "@/components/ui";
import { compareToBaseline, designCompletionSummary, stageGatingAreas, technicalHandoffReadiness, commandCenterHandoffReadiness } from "@/lib/factory/blueprint";
import { getBaseline, getBlueprint, getEnterpriseContext, getReviewSnapshot } from "@/lib/factory/content";
import { STAGE_LABELS } from "@/lib/factory/lifecycle";
import { getStore } from "@/lib/factory/store";
import { BlueprintCanvas } from "./canvas";
import { CreateBlueprint } from "./create";

export const dynamic = "force-dynamic";

export default async function Workflow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state, runtime } = rec;
  const bp = getBlueprint(state);
  const enterprise = getEnterpriseContext(state);
  if (!bp) {
    return (
      <>
        <h1>Workflow Blueprint</h1>
        <div className="section">
          <NextActionCard action={runtime.nextHumanAction} stageLabel={STAGE_LABELS[state.currentStage]} compact />
        </div>
        <div className="section">
          {enterprise.reviewStatus !== "CONFIRMED" ? <Note tone="warn">The enterprise context is {enterprise.reviewStatus.toLowerCase()}. Workflows are designed on top of the client&apos;s confirmed standards, systems, integrations and data; ground that first on the Enterprise page so the specialist names systems the client actually runs.</Note> : null}
          <Note>No workflow blueprint yet. Recommended: draft the structure first (phases, lanes, steps), confirm the steps, then enrich confirmed steps with rules, checks and human actions. Or start an empty canvas and author steps directly.</Note>
        </div>
        <div className="section">
          <CreateBlueprint stage={state.currentStage} />
        </div>
      </>
    );
  }
  const baseline = getBaseline(state);
  const snapshot = getReviewSnapshot(state);
  const dc = designCompletionSummary(bp);
  const diff = baseline && bp.mode === "TARGET" ? compareToBaseline(baseline, bp) : [];
  const underReview = ["BASELINE_APPROVAL", "TARGET_DESIGN_APPROVAL"].includes(state.currentStage) && state.activeStageExecution.status !== "CORRECTION_REQUIRED";
  return (
    <BlueprintCanvas
      blueprint={bp}
      stage={state.currentStage}
      stateRevision={state.stateRevision}
      designCompletion={dc}
      technical={technicalHandoffReadiness(bp)}
      commandCenter={commandCenterHandoffReadiness(bp)}
      diff={diff}
      hasSnapshot={!!snapshot}
      snapshotVersion={snapshot?.version}
      underReview={underReview}
      nextAction={runtime.nextHumanAction}
      stageLabel={STAGE_LABELS[state.currentStage]}
      gatingKeys={stageGatingAreas(state.currentStage)}
      enterpriseStatus={enterprise.reviewStatus}
      valueNorthStar={state.valueNorthStar}
      evidence={state.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT").map((e) => ({ evidenceRef: e.evidenceRef, title: e.title }))}
    />
  );
}
