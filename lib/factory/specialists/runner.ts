/**
 * Stateless AI worker. Loads state, compiles a Context Manifest, calls Claude with a
 * structured output schema, and hands the result back to the Control Plane as a
 * recommendation attached to a pending human decision. Nothing here mutates state
 * directly — every mutation goes through the Governed Action API.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { runAction } from "../service";
import type { Actor, FactoryState, TargetObject } from "../schema";
import { compileContext, type ContextManifest } from "./context";
import { EVIDENCE_INTAKE_CONTRACT, SPECIALISTS, type SpecialistContract, type SpecialistId } from "./contracts";

export const DEFAULT_MODEL = "claude-opus-5";

export function aiAvailable(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export interface SpecialistRunResult {
  jobId: string;
  status: "COMPLETE" | "FAILED" | "INSUFFICIENT_CONTEXT";
  manifest: ContextManifest;
  requestId?: string;
  recommendationRef?: string;
  error?: string;
  telemetry: { modelCalls: number; inputTokens: number; outputTokens: number; latencyMs: number; retries: number; cacheReadTokens: number };
}

function contractFor(specialistId: SpecialistId, task: string): SpecialistContract {
  if (specialistId === "BLUEPRINT" && task === "EVIDENCE_INTAKE") return EVIDENCE_INTAKE_CONTRACT;
  return SPECIALISTS[specialistId];
}

function toRecommendation(contract: SpecialistContract, parsed: Record<string, unknown>, state: FactoryState): { title: string; summary: string; rationale: string; confidence: "LOW" | "MEDIUM" | "HIGH"; payload: Record<string, unknown>; target: TargetObject; question: string } {
  const base = { summary: String(parsed.summary ?? ""), rationale: String(parsed.rationale ?? ""), confidence: (parsed.confidence as "LOW" | "MEDIUM" | "HIGH") ?? "MEDIUM" };
  switch (contract.producesKind) {
    case "BLUEPRINT": {
      const steps = (parsed.steps as Record<string, unknown>[]).map((s) => ({
        ...s,
        checks: ((s.checks as Record<string, unknown>[]) ?? []).map((c) => ({ ...c, execution: { stepId: s.contractId, persona: c.executionPersona, point: c.executionPoint } })),
      }));
      return { ...base, title: `Blueprint draft from ${contract.name}`, payload: { kind: "BLUEPRINT", blueprint: { workflowId: state.workflowId, mode: state.currentStage === "TARGET_DESIGN" ? "TARGET" : "BASELINE", phases: parsed.phases, steps, currentAi: parsed.currentAi }, valueNorthStar: parsed.valueNorthStar, openItems: parsed.openItems }, target: { type: "WORKFLOW", id: state.workflowId }, question: `Accept this ${steps.length}-step draft into the working design? Every step, check and action will remain OPEN for human review.` };
    }
    case "INTEGRATION_CONTRACT":
      return { ...base, title: "Integration & Data Contract draft", payload: { kind: "INTEGRATION_CONTRACT", contract: { integrations: (parsed.integrations as Record<string, unknown>[]).map((i) => ({ ...i, evidenceRefs: [], readinessHistory: [] })), data: parsed.data, sourceWorkflowVersion: "" } }, target: { type: "INTEGRATION", id: "integration-contract" }, question: "Accept this Integration & Data Contract draft? Readiness states remain exactly as evidenced." };
    case "TECHNICAL_ENRICHMENT":
      return { ...base, title: "Technical design enrichment", payload: { kind: "TECHNICAL_ENRICHMENT", notes: [...(parsed.notes as string[]), ...((parsed.additionalConstraints as string[]) ?? []).map((c) => `Constraint: ${c}`), ...((parsed.reuseWarnings as string[]) ?? []).map((w) => `Reuse warning: ${w}`)] }, target: { type: "ARTIFACT", id: "technical-design" }, question: "Attach these architecture notes to the Controlled Technical Design and recompile?" };
    case "TRANSFORMATION_PLAN":
      return { ...base, title: "Transformation plan draft", payload: { kind: "TRANSFORMATION_PLAN", plan: { workPackages: (parsed.workPackages as Record<string, unknown>[]).map((wp) => ({ ...wp, activities: (wp.activities as Record<string, unknown>[]).map((a) => ({ ...a, aiProductivityAssumption: a.aiProductivityAssumption ?? undefined, assumptionRationale: a.assumptionRationale ?? undefined, nonCompressibleFloor: a.nonCompressibleFloor ?? undefined })) })), humanAdoptionPlan: parsed.humanAdoptionPlan, complianceRiskReadout: parsed.complianceRiskReadout, economics: { provided: false, note: "Not requested" } } }, target: { type: "ARTIFACT", id: "transformation-plan" }, question: "Accept this work-package plan as the working Transformation Plan?" };
    case "OPEN_ITEMS":
      return { ...base, title: "Validator findings", payload: { kind: "OPEN_ITEMS", items: parsed.items }, target: { type: "ARTIFACT", id: "validation-report" }, question: "Raise these findings as open items?" };
    case "EVIDENCE_CLASSIFICATION":
      return { ...base, title: "Evidence inventory and classification", payload: { kind: "EVIDENCE_CLASSIFICATION", classifications: (parsed.classifications as Record<string, unknown>[]).map((c) => ({ ...c, evidenceType: c.evidenceType ?? undefined })), contradictions: parsed.contradictions, nextQuestion: parsed.nextQuestion }, target: { type: "ARTIFACT", id: "evidence-catalog" }, question: String(parsed.nextQuestion ?? "Accept this classification of the evidence catalog?") };
    default:
      return { ...base, title: contract.name, payload: { kind: "NONE" }, target: { type: "ARTIFACT", id: "none" }, question: "" };
  }
}

/**
 * Run a specialist end to end. Uses the Governed Action API for every state change:
 * QUEUE_JOB → START_JOB → (model call) → COMPLETE_JOB with recommendation, or FAIL_JOB.
 */
export async function runSpecialist(engagementId: string, specialistId: SpecialistId, actor: Actor, task = "DEFAULT", client?: Anthropic): Promise<SpecialistRunResult> {
  const contract = contractFor(specialistId, task);
  if (!contract.aiWorker) throw new Error(`${specialistId} is a deterministic service, not an AI worker`);
  const queued = await runAction(engagementId, { actionType: "QUEUE_JOB", actor, payload: { jobType: "SPECIALIST_RUN", specialistId } });
  const jobId = String(queued.data?.jobId);
  const state = queued.state;
  const manifest = compileContext(state, contract, actor, `${specialistId}:${task}`, queued.runtime.projection_of_state_revision);
  const telemetry = { modelCalls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, retries: 0, cacheReadTokens: 0 };
  if (manifest.sufficiency === "INSUFFICIENT" || manifest.sufficiency === "STALE") {
    await runAction(engagementId, { actionType: "FAIL_JOB", actor, payload: { jobId, error: `Context ${manifest.sufficiency}: ${manifest.sufficiencyDetail}` } });
    return { jobId, status: "INSUFFICIENT_CONTEXT", manifest, error: manifest.sufficiencyDetail, telemetry };
  }
  if (!client && !aiAvailable()) {
    await runAction(engagementId, { actionType: "FAIL_JOB", actor, payload: { jobId, error: "AI worker unavailable: no Anthropic credentials configured. Deterministic controls and human decisions continue to operate." } });
    return { jobId, status: "FAILED", manifest, error: "AI worker unavailable", telemetry };
  }
  await runAction(engagementId, { actionType: "START_JOB", actor, payload: { jobId } });
  const anthropic = client ?? new Anthropic();
  const started = Date.now();
  try {
    const schema = contract.outputSchema as z.ZodTypeAny;
    const response = await anthropic.messages.parse({
      model: process.env.FACTORY_MODEL || DEFAULT_MODEL,
      max_tokens: 32000,
      system: [
        { type: "text", text: contract.systemPrompt, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Must not: ${contract.mustNot.join("; ")}.` },
      ],
      messages: [
        {
          role: "user",
          content: `Context Manifest ${manifest.manifestId} (state revision ${manifest.stateRevision}, sufficiency ${manifest.sufficiency}).\nSections: ${manifest.sectionsIncluded.join(", ")}.\nExclusions: ${manifest.exclusions.join("; ")}.\n\n${JSON.stringify(manifest.body)}\n\nTask: ${task === "DEFAULT" ? contract.objective : task}. Respond with the structured output only.`,
        },
      ],
      output_config: { format: zodOutputFormat(schema) },
    });
    telemetry.modelCalls = 1;
    telemetry.inputTokens = response.usage.input_tokens;
    telemetry.outputTokens = response.usage.output_tokens;
    telemetry.cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
    telemetry.latencyMs = Date.now() - started;
    if (response.stop_reason === "refusal") throw new Error(`Model declined the task${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}`);
    if (response.stop_reason === "max_tokens") throw new Error("Model output truncated (max_tokens)");
    const parsed = response.parsed_output as Record<string, unknown> | null;
    if (!parsed) throw new Error("Model output did not match the specialist schema");
    const rec = toRecommendation(contract, parsed, state);
    const done = await runAction(engagementId, { actionType: "COMPLETE_JOB", actor, payload: { jobId, telemetry, recommendation: { ...rec, source: "AI_SPECIALIST", specialistId, producedAt: new Date().toISOString(), sourceStateRevision: manifest.stateRevision } } });
    return { jobId, status: "COMPLETE", manifest, requestId: done.data?.requestId as string | undefined, recommendationRef: done.data?.recommendationRef as string | undefined, telemetry };
  } catch (err) {
    telemetry.latencyMs = Date.now() - started;
    const message = err instanceof Anthropic.APIError ? `API error ${err.status}: ${err.message}` : err instanceof Error ? err.message : String(err);
    await runAction(engagementId, { actionType: "FAIL_JOB", actor, payload: { jobId, error: message } });
    return { jobId, status: "FAILED", manifest, error: message, telemetry };
  }
}
