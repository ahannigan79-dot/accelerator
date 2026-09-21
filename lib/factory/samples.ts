/**
 * Sample intake packs: a manifest plus raw files on disk, ingested through the Governed Action API
 * exactly as a consultant's upload would be.
 */

import fs from "node:fs";
import path from "node:path";
import type { Actor, EvidenceRecord } from "./schema";
import { runAction, startEngagement } from "./service";
import type { CreateEngagementInput } from "./state";

export interface PackManifest {
  engagement: CreateEngagementInput;
  records: (Pick<EvidenceRecord, "title" | "evidenceType" | "sourceClass" | "scope" | "requirementIds" | "claims" | "summary"> & { file: string })[];
}

export const SAMPLE_PACKS: Record<string, { dir: string; label: string }> = {
  "krishna-industries": { dir: "samples/krishna-industries", label: "Krishna Industries · procure-to-pay (messy intake)" },
};

export function readPack(dir: string): { manifest: PackManifest; files: Record<string, string> } {
  const root = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")) as PackManifest;
  const files: Record<string, string> = {};
  for (const r of manifest.records) files[r.file] = fs.readFileSync(path.join(root, r.file), "utf8");
  return { manifest, files };
}

/** Create the engagement and ingest every record with its raw content. Returns the engagement id and what was accepted. */
export async function ingestPack(dir: string, actor: Actor, engagementId?: string) {
  const { manifest, files } = readPack(dir);
  const rec = await startEngagement({ ...manifest.engagement, engagementId }, actor);
  const id = rec.state.engagement_id;
  const records = manifest.records.map((r) => ({ title: r.title, evidenceType: r.evidenceType, sourceClass: r.sourceClass, scope: r.scope, requirementIds: r.requirementIds, claims: r.claims, summary: r.summary, fileName: r.file, content: files[r.file] }));
  const res = await runAction(id, { actionType: "UPLOAD_EVIDENCE", actor, payload: { records } });
  return { engagementId: id, accepted: res.data?.accepted as string[], quarantined: res.data?.quarantined as string[], contradictions: res.state.discoverySufficiency.contradictions.filter((c) => c.status === "OPEN").map((c) => c.description), discovery: res.state.discoverySufficiency.layers, nextHumanAction: res.nextHumanAction };
}
