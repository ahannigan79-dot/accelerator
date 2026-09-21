/** Artifact registry with authority states and lineage. */

import { nextId } from "./ids";
import type { ArtifactKind, ArtifactRevision, FactoryState } from "./schema";

export interface RegisterInput {
  kind: ArtifactKind;
  title: string;
  version: string;
  producedBy: ArtifactRevision["producedBy"];
  specialistId?: string;
  upstream?: { artifactId: string; version: string }[];
  evidenceClass?: ArtifactRevision["evidenceClass"];
  contentKey?: string;
  summary: string;
  authority?: ArtifactRevision["authority"];
  reviewStatus?: ArtifactRevision["reviewStatus"];
}

/** Register a new revision. When it becomes CURRENT_AUTHORITATIVE, the previous current revision of the same kind is SUPERSEDED with lineage. */
export function registerArtifact(state: FactoryState, input: RegisterInput, at: string): ArtifactRevision {
  const authority = input.authority ?? "CURRENT_AUTHORITATIVE";
  const art: ArtifactRevision = {
    artifactId: nextId(state, "ART"),
    kind: input.kind,
    title: input.title,
    version: input.version,
    authority,
    reviewStatus: input.reviewStatus ?? "OPEN",
    createdAt: at,
    createdAtStateRevision: state.stateRevision,
    producedBy: input.producedBy,
    specialistId: input.specialistId,
    upstream: input.upstream ?? [],
    evidenceClass: input.evidenceClass ?? "DERIVED",
    contentKey: input.contentKey,
    summary: input.summary,
  };
  if (authority === "CURRENT_AUTHORITATIVE") {
    for (const prev of state.authoritativeArtifacts) {
      if (prev.kind === input.kind && prev.authority === "CURRENT_AUTHORITATIVE") {
        prev.authority = "SUPERSEDED";
        prev.supersededBy = art.artifactId;
        art.supersedes = prev.artifactId;
      }
    }
  }
  state.authoritativeArtifacts.push(art);
  return art;
}

export function currentArtifact(state: FactoryState, kind: ArtifactKind): ArtifactRevision | undefined {
  return state.authoritativeArtifacts.find((a) => a.kind === kind && a.authority === "CURRENT_AUTHORITATIVE");
}

export function bumpVersion(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return `${v}.1`;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

export function bumpMinor(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) return `${v}.1`;
  return `${m[1]}.${Number(m[2]) + 1}.0`;
}
