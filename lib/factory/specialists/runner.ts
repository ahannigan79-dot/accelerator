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
import { BLUEPRINT_ENRICH_CONTRACT, BLUEPRINT_STRUCTURE_CONTRACT, CITATION_CHECK_CONTRACT, ENTERPRISE_CONTEXT_CONTRACT, EVIDENCE_INTAKE_CONTRACT, SPECIALISTS, type SpecialistContract, type SpecialistId } from "./contracts";
import { getBlueprint } from "../content";
import { activeSteps } from "../blueprint";

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

export function contractFor(specialistId: SpecialistId, task: string): SpecialistContract {
  if (specialistId === "BLUEPRINT" && task === "EVIDENCE_INTAKE") return EVIDENCE_INTAKE_CONTRACT;
  if (specialistId === "BLUEPRINT" && task === "STRUCTURE") return BLUEPRINT_STRUCTURE_CONTRACT;
  if (specialistId === "BLUEPRINT" && task === "ENRICH") return BLUEPRINT_ENRICH_CONTRACT;
  if (specialistId === "BLUEPRINT" && task === "CITATION_CHECK") return CITATION_CHECK_CONTRACT;
  if (specialistId === "BLUEPRINT" && task === "ENTERPRISE_CONTEXT") return ENTERPRISE_CONTEXT_CONTRACT;
  return SPECIALISTS[specialistId];
}

/** Rules that cite an evidence record and can therefore be checked against it. */
export function citedRules(state: FactoryState): { ruleId: string; stepId: string; statement: string; sourceRef: string; sourceKnown: boolean }[] {
  const bp = getBlueprint(state);
  if (!bp) return [];
  const known = new Set(state.evidenceCatalog.filter((e) => e.authorityStatus === "CURRENT").map((e) => e.evidenceRef));
  return activeSteps(bp).flatMap((st) => st.rules.filter((r) => r.provenance.sourceRef.trim()).map((r) => ({ ruleId: r.ruleId, stepId: st.contractId, statement: r.statement, sourceRef: r.provenance.sourceRef, sourceKnown: known.has(r.provenance.sourceRef) })));
}

/**
 * Task-specific preflight and instruction. Preflight returns a reason the task cannot run; the instruction is
 * appended to the user turn so the model works on exactly the items the state allows (confirmed steps, cited rules).
 */
export function taskBrief(task: string, state: FactoryState): { blocked?: string; instruction: string } {
  const bp = getBlueprint(state);
  if (task === "ENRICH") {
    const confirmed = bp ? activeSteps(bp).filter((st) => st.status === "confirmed") : [];
    if (!confirmed.length) return { blocked: "No confirmed steps to enrich. Confirm the workflow structure first.", instruction: "" };
    return { instruction: `Enrich exactly these confirmed steps and no others: ${confirmed.map((st) => `${st.contractId} (${st.name}; owner ${st.owner}; type ${st.type})`).join("; ")}. Steps not in this list are unconfirmed and must not appear in your output.` };
  }
  if (task === "CITATION_CHECK") {
    const rules = citedRules(state).filter((r) => r.sourceKnown);
    if (!rules.length) return { blocked: "No rule cites an evidence record in the catalog. Link evidence to rules first.", instruction: "" };
    return { instruction: `Check these citations, one verdict each:\n${rules.map((r) => `- ${r.ruleId} cites ${r.sourceRef}: "${r.statement}"`).join("\n")}` };
  }
  if (task === "STRUCTURE" && bp) return { instruction: `A working blueprint v${bp.version} already exists (${activeSteps(bp).length} steps). Your structure replaces it when accepted; keep existing step ids where the step is the same.` };
  return { instruction: "" };
}

function toRecommendation(contract: SpecialistContract, parsed: Record<string, unknown>, state: FactoryState): { title: string; summary: string; rationale: string; confidence: "LOW" | "MEDIUM" | "HIGH"; payload: Record<string, unknown>; target: TargetObject; question: string } {
  const base = { summary: String(parsed.summary ?? ""), rationale: String(parsed.rationale ?? ""), confidence: (parsed.confidence as "LOW" | "MEDIUM" | "HIGH") ?? "MEDIUM" };
  switch (contract.producesKind) {
    case "BLUEPRINT": {
      const structureOnly = contract === BLUEPRINT_STRUCTURE_CONTRACT;
      const steps = (parsed.steps as Record<string, unknown>[]).map((s) => ({
        ...s,
        rules: (s.rules as unknown[]) ?? [],
        humanActions: (s.humanActions as unknown[]) ?? [],
        checks: ((s.checks as Record<string, unknown>[]) ?? []).map((c) => ({ ...c, execution: { stepId: s.contractId, persona: c.executionPersona, point: c.executionPoint } })),
      }));
      return { ...base, title: structureOnly ? "Workflow structure draft" : `Blueprint draft from ${contract.name}`, payload: { kind: "BLUEPRINT", blueprint: { workflowId: state.workflowId, mode: state.currentStage === "TARGET_DESIGN" ? "TARGET" : "BASELINE", phases: parsed.phases, steps, currentAi: parsed.currentAi }, valueNorthStar: parsed.valueNorthStar, openItems: parsed.openItems, contradictionsNoted: parsed.contradictionsNoted, referenceArchitecture: parsed.referenceArchitecture }, target: { type: "WORKFLOW", id: state.workflowId }, question: structureOnly ? `Accept this ${steps.length}-step structure as the working design? Steps arrive OPEN; confirm them, then run enrichment to draft rules, checks and actions per confirmed step.` : `Accept this ${steps.length}-step draft into the working design? Every step, check and action will remain OPEN for human review.` };
    }
    case "BLUEPRINT_ENRICHMENT": {
      const steps = (parsed.steps as Record<string, unknown>[]).map((s) => ({
        ...s,
        checks: ((s.checks as Record<string, unknown>[]) ?? []).map((c) => ({ ...c, execution: { stepId: s.contractId, persona: c.executionPersona, point: c.executionPoint } })),
      })) as Record<string, unknown>[];
      const counts = steps.reduce<{ rules: number; checks: number; actions: number }>((acc, s) => ({ rules: acc.rules + ((s.rules as unknown[]) ?? []).length, checks: acc.checks + ((s.checks as unknown[]) ?? []).length, actions: acc.actions + ((s.humanActions as unknown[]) ?? []).length }), { rules: 0, checks: 0, actions: 0 });
      return { ...base, title: `Enrichment for ${steps.length} confirmed step(s)`, payload: { kind: "BLUEPRINT_ENRICHMENT", steps, openItems: parsed.openItems }, target: { type: "WORKFLOW", id: state.workflowId }, question: `Accept ${counts.rules} rule(s), ${counts.checks} check(s) and ${counts.actions} human action(s) onto the confirmed steps? Unreviewed items on those steps are replaced; confirmed items are kept. Step structure stays confirmed.` };
    }
    case "CITATION_VERDICTS": {
      const verdicts = (parsed.verdicts as { verdict: string }[]) ?? [];
      const unsupported = verdicts.filter((v) => v.verdict === "NOT_SUPPORTED" || v.verdict === "SOURCE_MISSING").length;
      return { ...base, title: `Citation check: ${verdicts.length} rule(s), ${unsupported} unsupported`, payload: { kind: "CITATION_VERDICTS", verdicts }, target: { type: "WORKFLOW", id: state.workflowId }, question: `Apply these verdicts? ${unsupported} rule(s) with unsupported citations become DISPUTED; supported citations move UNCONFIRMED rules to SOURCE_SUPPORTED. Rules a human confirmed are never downgraded silently.` };
    }
    case "ENTERPRISE_CONTEXT": {
      const ec = parsed.enterpriseContext as Record<string, unknown[]>;
      const n = ["architectureStandards", "systems", "integrationPatterns", "dataDomains", "securityCompliance", "aiPolicy"].reduce((a, k) => a + ((ec[k] as unknown[]) ?? []).length, 0);
      const rows = Object.fromEntries(Object.entries(ec).map(([k, v]) => [k, Array.isArray(v) ? v.map((e) => (e && typeof e === "object" ? { ...(e as Record<string, unknown>), sensitivity: (e as Record<string, unknown>).sensitivity ?? undefined } : e)) : v]));
      return { ...base, title: `Enterprise context draft (${n} entries)`, payload: { kind: "ENTERPRISE_CONTEXT", enterpriseContext: rows, openItems: parsed.openItems }, target: { type: "ARTIFACT", id: "enterprise-context" }, question: `Accept this ${n}-entry enterprise context draft? It stays unconfirmed until the client architect confirms it; entries with the same name are replaced, others kept.` };
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
  const brief = taskBrief(task, queued.state);
  if (brief.blocked) {
    await runAction(engagementId, { actionType: "FAIL_JOB", actor, payload: { jobId, error: brief.blocked } });
    return { jobId, manifest, earlyResult: { jobId, status: "INSUFFICIENT_CONTEXT", manifest, error: brief.blocked, telemetry } };
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
    const brief = taskBrief(task, state);
    const userText = `Context Manifest ${manifest.manifestId} (state revision ${manifest.stateRevision}, sufficiency ${manifest.sufficiency}).\nSections: ${manifest.sectionsIncluded.join(", ")}.\nExclusions: ${manifest.exclusions.join("; ")}.\n\n${JSON.stringify(manifest.body)}\n\nTask: ${contract.objective}${brief.instruction ? `\n${brief.instruction}` : ""}${constrained ? " Respond with the structured output only." : `\n\nRespond with a single JSON object and nothing else (no prose, no code fence) that conforms exactly to this JSON Schema:\n${schemaJson}`}`;
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
