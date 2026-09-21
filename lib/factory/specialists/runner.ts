/**
 * Stateless AI worker. Loads state, compiles a Context Manifest, calls Claude with a
 * structured output schema, and hands the result back to the Control Plane as a
 * recommendation attached to a pending human decision. Nothing here mutates state
 * directly — every mutation goes through the Governed Action API.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { runAction } from "../service";
import type { Actor, FactoryState, TargetObject } from "../schema";
import { compileContext, type ContextManifest } from "./context";
import { EVIDENCE_INTAKE_CONTRACT, SPECIALISTS, type SpecialistContract, type SpecialistId } from "./contracts";

export const DEFAULT_MODEL = "claude-opus-5";
/** Schemas larger than this are sent in the prompt instead of compiled into a decoding grammar. */
export const MAX_GRAMMAR_SCHEMA_CHARS = 3500;

/** Tolerate a code fence or stray prose around the JSON object. */
export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

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
export interface QueuedSpecialist {
  jobId: string;
  manifest: ContextManifest;
  /** Set when the job was failed at queue time (insufficient context, no AI credentials). */
  earlyResult?: SpecialistRunResult;
}

/** Phase 1: queue the job, compile the Context Manifest, and fail fast when the run cannot proceed. Returns quickly. */
export async function queueSpecialist(engagementId: string, specialistId: SpecialistId, actor: Actor, task = "DEFAULT", client?: Anthropic): Promise<QueuedSpecialist> {
  const contract = contractFor(specialistId, task);
  if (!contract.aiWorker) throw new Error(`${specialistId} is a deterministic service, not an AI worker`);
  const queued = await runAction(engagementId, { actionType: "QUEUE_JOB", actor, payload: { jobType: "SPECIALIST_RUN", specialistId } });
  const jobId = String(queued.data?.jobId);
  const manifest = compileContext(queued.state, contract, actor, `${specialistId}:${task}`, queued.runtime.projection_of_state_revision);
  const telemetry = { modelCalls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, retries: 0, cacheReadTokens: 0 };
  if (manifest.sufficiency === "INSUFFICIENT" || manifest.sufficiency === "STALE") {
    await runAction(engagementId, { actionType: "FAIL_JOB", actor, payload: { jobId, error: `Context ${manifest.sufficiency}: ${manifest.sufficiencyDetail}` } });
    return { jobId, manifest, earlyResult: { jobId, status: "INSUFFICIENT_CONTEXT", manifest, error: manifest.sufficiencyDetail, telemetry } };
  }
  if (!client && !aiAvailable()) {
    await runAction(engagementId, { actionType: "FAIL_JOB", actor, payload: { jobId, error: "AI worker unavailable: no Anthropic credentials configured. Deterministic controls and human decisions continue to operate." } });
    return { jobId, manifest, earlyResult: { jobId, status: "FAILED", manifest, error: "AI worker unavailable", telemetry } };
  }
  return { jobId, manifest };
}

/** Phase 2: the long model call. Runs after the HTTP response has been sent; every outcome is recorded on the job. */
export async function executeSpecialist(engagementId: string, jobId: string, manifest: ContextManifest, specialistId: SpecialistId, actor: Actor, task = "DEFAULT", client?: Anthropic): Promise<SpecialistRunResult> {
  const contract = contractFor(specialistId, task);
  const telemetry = { modelCalls: 0, inputTokens: 0, outputTokens: 0, latencyMs: 0, retries: 0, cacheReadTokens: 0 };
  const startedRun = await runAction(engagementId, { actionType: "START_JOB", actor, payload: { jobId } });
  const state = startedRun.state;
  const anthropic = client ?? new Anthropic({ maxRetries: 1 });
  const started = Date.now();
  try {
    // The SDK helper runs on the Zod v4 runtime but its type declarations reference the v3 ZodType, so the cast bridges the two.
    const schema = contract.outputSchema;
    const format = zodOutputFormat(schema as unknown as Parameters<typeof zodOutputFormat>[0]);
    const schemaJson = JSON.stringify(format.schema);
    // Constrained decoding compiles the schema into a grammar; the API rejects large ones. Above the threshold the schema
    // travels in the prompt instead and the output is validated locally, with one repair round on validation failure.
    const constrained = schemaJson.length <= MAX_GRAMMAR_SCHEMA_CHARS;
    const userText = `Context Manifest ${manifest.manifestId} (state revision ${manifest.stateRevision}, sufficiency ${manifest.sufficiency}).\nSections: ${manifest.sectionsIncluded.join(", ")}.\nExclusions: ${manifest.exclusions.join("; ")}.\n\n${JSON.stringify(manifest.body)}\n\nTask: ${task === "DEFAULT" ? contract.objective : task}.${constrained ? " Respond with the structured output only." : `\n\nRespond with a single JSON object and nothing else (no prose, no code fence) that conforms exactly to this JSON Schema:\n${schemaJson}`}`;
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
    let parsed: Record<string, unknown> | null = null;
    let lastError = "";
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const stream = anthropic.messages.stream({
        model: process.env.FACTORY_MODEL || DEFAULT_MODEL,
        max_tokens: 64000,
        system: [
          { type: "text", text: contract.systemPrompt, cache_control: { type: "ephemeral" } },
          { type: "text", text: `Must not: ${contract.mustNot.join("; ")}.` },
        ],
        messages,
        ...(constrained ? { output_config: { format: { type: format.type, schema: format.schema } } } : {}),
      });
      const response = await stream.finalMessage();
      telemetry.modelCalls += 1;
      telemetry.inputTokens += response.usage.input_tokens;
      telemetry.outputTokens += response.usage.output_tokens;
      telemetry.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
      telemetry.latencyMs = Date.now() - started;
      if (response.stop_reason === "refusal") throw new Error(`Model declined the task${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : ""}`);
      if (response.stop_reason === "max_tokens") throw new Error("Model output truncated (max_tokens)");
      const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      try {
        parsed = schema.parse(JSON.parse(extractJson(text))) as Record<string, unknown>;
      } catch (e) {
        lastError = e instanceof Error ? e.message.slice(0, 1500) : String(e);
        telemetry.retries += 1;
        messages.push({ role: "assistant", content: response.content }, { role: "user", content: `That output failed validation against the schema:\n${lastError}\n\nReturn the corrected JSON object only.` });
      }
    }
    if (!parsed) throw new Error(`Model output did not match the specialist schema after repair: ${lastError.slice(0, 300)}`);
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

/** Queue and execute in one call. Used by tests and scripts; the HTTP route splits the phases so the response never waits on the model. */
export async function runSpecialist(engagementId: string, specialistId: SpecialistId, actor: Actor, task = "DEFAULT", client?: Anthropic): Promise<SpecialistRunResult> {
  const q = await queueSpecialist(engagementId, specialistId, actor, task, client);
  if (q.earlyResult) return q.earlyResult;
  return executeSpecialist(engagementId, q.jobId, q.manifest, specialistId, actor, task, client);
}
