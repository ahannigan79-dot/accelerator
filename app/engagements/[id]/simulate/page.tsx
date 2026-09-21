import { notFound } from "next/navigation";
import { Note } from "@/components/ui";
import { getBlueprint, getSimulationPacks } from "@/lib/factory/content";
import { packSummary } from "@/lib/factory/simulation";
import { getStore } from "@/lib/factory/store";
import { SimulationStudio } from "./studio";

export const dynamic = "force-dynamic";

export default async function Simulate({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pack?: string }> }) {
  const { id } = await params;
  const { pack: packParam } = await searchParams;
  const rec = await getStore().get(id);
  if (!rec) notFound();
  const { state } = rec;
  const bp = getBlueprint(state);
  const packs = getSimulationPacks(state);
  const packIds = Object.keys(packs);
  const packId = packParam && packs[packParam] ? packParam : packIds[packIds.length - 1];
  const pack = packId ? packs[packId] : undefined;
  const job = pack ? state.jobs.find((j) => j.resultArtifactRefs.includes(pack.packId)) : undefined;
  if (!bp) return <><h1>Workflow Simulation Studio</h1><div className="section"><Note>Simulation needs a workflow blueprint.</Note></div></>;
  return <SimulationStudio blueprint={bp} pack={pack} packs={packIds.map((p) => ({ packId: p, mode: packs[p].mode, summary: packSummary(packs[p]), batch: packs[p].batch }))} job={job} />;
}
