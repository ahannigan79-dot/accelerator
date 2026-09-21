import { notFound } from "next/navigation";
import { Note } from "@/components/ui";
import { compareToBaseline, designCompletionSummary, technicalHandoffReadiness, commandCenterHandoffReadiness } from "@/lib/factory/blueprint";
import { getBaseline, getBlueprint, getReviewSnapshot } from "@/lib/factory/content";
import { getStore } from "@/lib/factory/store";
import { BlueprintCanvas } from "./canvas";
import { CreateBlueprint } from "./create";

export const dynamic = "force-dynamic";

export default async function Workflow({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const bp = getBlueprint(state);
  if (!bp) {
    return (
      <>
        <h1>Workflow Blueprint</h1>
        <div className="section">
          <Note>No workflow blueprint yet. Draft it with the Blueprint specialist from the evidence catalog, or start an empty canvas and author steps directly.</Note>
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
      valueNorthStar={state.valueNorthStar}
      evidence={state.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT").map((e) => ({ evidenceRef: e.evidenceRef, title: e.title }))}
    />
  );
}
