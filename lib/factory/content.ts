/** Typed accessors for artifact bodies stored inside Factory State. */

import type { Blueprint } from "./blueprint";
import type { BuildContract, RepositoryRealizationPlan } from "./build";
import type { IntegrationDataContract } from "./integration";
import type { TransformationPlan } from "./planner";
import { ENTERPRISE_SECTIONS, type EnterpriseContext, type FactoryState } from "./schema";
import type { SimulationPack } from "./simulation";
import type { ControlledTechnicalDesign } from "./technical";
import type { ValidationReport } from "./validator";

export const CONTENT_KEYS = {
  blueprint: "blueprint", // current working design (baseline while in BASELINE_*; target afterwards)
  baselineSnapshot: "baselineSnapshot", // approved baseline (frozen)
  reviewSnapshot: "reviewSnapshot", // protected review copy
  integrationContract: "integrationContract",
  technicalDesign: "technicalDesign",
  transformationPlan: "transformationPlan",
  buildContract: "buildContract",
  realizationPlan: "realizationPlan",
  validationReport: "validationReport",
  simulationPacks: "simulationPacks",
  experiencePack: "experiencePack",
} as const;

export function emptyEnterpriseContext(at = "1970-01-01T00:00:00.000Z"): EnterpriseContext {
  return { reviewStatus: "EMPTY", version: 0, updatedAt: at, summary: "", architectureStandards: [], systems: [], integrationPatterns: [], dataDomains: [], securityCompliance: [], aiPolicy: [], gaps: [] };
}

/** Enterprise context with a safe default for records created before it existed. */
export function getEnterpriseContext(s: FactoryState): EnterpriseContext {
  return s.enterpriseContext ?? emptyEnterpriseContext(s.stateUpdatedAt);
}

export function enterpriseEntryCount(e: EnterpriseContext): number {
  return ENTERPRISE_SECTIONS.reduce((n, k) => n + e[k].length, 0);
}

export function getBlueprint(s: FactoryState): Blueprint | undefined {
  return s.artifactContent[CONTENT_KEYS.blueprint] as Blueprint | undefined;
}
export function getBaseline(s: FactoryState): Blueprint | undefined {
  return s.artifactContent[CONTENT_KEYS.baselineSnapshot] as Blueprint | undefined;
}
export function getReviewSnapshot(s: FactoryState): Blueprint | undefined {
  return s.artifactContent[CONTENT_KEYS.reviewSnapshot] as Blueprint | undefined;
}
export function getIntegrationContract(s: FactoryState): IntegrationDataContract | undefined {
  return s.artifactContent[CONTENT_KEYS.integrationContract] as IntegrationDataContract | undefined;
}
export function getTechnicalDesign(s: FactoryState): ControlledTechnicalDesign | undefined {
  return s.artifactContent[CONTENT_KEYS.technicalDesign] as ControlledTechnicalDesign | undefined;
}
export function getTransformationPlan(s: FactoryState): TransformationPlan | undefined {
  return s.artifactContent[CONTENT_KEYS.transformationPlan] as TransformationPlan | undefined;
}
export function getBuildContract(s: FactoryState): BuildContract | undefined {
  return s.artifactContent[CONTENT_KEYS.buildContract] as BuildContract | undefined;
}
export function getRealizationPlan(s: FactoryState): RepositoryRealizationPlan | undefined {
  return s.artifactContent[CONTENT_KEYS.realizationPlan] as RepositoryRealizationPlan | undefined;
}
export function getValidationReport(s: FactoryState): ValidationReport | undefined {
  return s.artifactContent[CONTENT_KEYS.validationReport] as ValidationReport | undefined;
}
export function getSimulationPacks(s: FactoryState): Record<string, SimulationPack> {
  return (s.artifactContent[CONTENT_KEYS.simulationPacks] as Record<string, SimulationPack> | undefined) ?? {};
}
