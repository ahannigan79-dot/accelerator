/**
 * Engagement isolation: one engagement at a time; cross-client artifacts are quarantined, never inherited.
 */

import type { EvidenceRecord, FactoryState } from "./schema";

export interface IsolationVerdict {
  accepted: boolean;
  reason?: string;
}

export function verifyEvidenceIdentity(state: FactoryState, rec: Pick<EvidenceRecord, "engagementId" | "workflowId">): IsolationVerdict {
  if (rec.engagementId && rec.engagementId !== state.engagement_id) return { accepted: false, reason: `Evidence belongs to engagement ${rec.engagementId}; this engagement is ${state.engagement_id}` };
  if (rec.workflowId && rec.workflowId !== state.workflowId) return { accepted: false, reason: `Evidence belongs to workflow ${rec.workflowId}; this engagement's workflow is ${state.workflowId}` };
  return { accepted: true };
}

export function verifyEngagementIdentity(state: FactoryState, engagementId: string): IsolationVerdict {
  if (engagementId !== state.engagement_id) return { accepted: false, reason: `Request targets ${engagementId}; loaded state is ${state.engagement_id}` };
  return { accepted: true };
}
