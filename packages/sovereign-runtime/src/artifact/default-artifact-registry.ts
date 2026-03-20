import { ArtifactRegistry } from './artifact-registry.js';
import type { FamilyNormalizer } from './pipeline/family-normalizer.js';
import { TEXT_ASSIST_ENTRIES, textAssistNormalizer } from './families/text-assist.js';
import { TEXT_MODEL_ENTRIES, textModelNormalizer } from './families/text-model.js';
import { IMAGE_ENTRIES, imageNormalizer } from './families/image.js';
import { EXPRESSION_ENTRIES, expressionNormalizer } from './families/expression.js';
import { VISION_ENTRIES, visionNormalizer } from './families/vision.js';
import { ACTION_ENTRIES, actionNormalizer } from './families/action.js';

// ---------------------------------------------------------------------------
// Default Artifact Registry — loads all artifact families
// ---------------------------------------------------------------------------

export function createDefaultArtifactRegistry(): ArtifactRegistry {
  const registry = new ArtifactRegistry();
  registry.loadFromEntries([
    // Tier 1
    ...TEXT_ASSIST_ENTRIES,
    ...TEXT_MODEL_ENTRIES,
    ...IMAGE_ENTRIES,
    // Tier 2
    ...EXPRESSION_ENTRIES,
    ...VISION_ENTRIES,
    // Tier 3
    ...ACTION_ENTRIES,
  ]);
  return registry;
}

export function createDefaultFamilyNormalizers(): Map<string, FamilyNormalizer> {
  const normalizers = new Map<string, FamilyNormalizer>();
  // Tier 1
  normalizers.set(textAssistNormalizer.family, textAssistNormalizer);
  normalizers.set(textModelNormalizer.family, textModelNormalizer);
  normalizers.set(imageNormalizer.family, imageNormalizer);
  // Tier 2
  normalizers.set(expressionNormalizer.family, expressionNormalizer);
  normalizers.set(visionNormalizer.family, visionNormalizer);
  // Tier 3
  normalizers.set(actionNormalizer.family, actionNormalizer);
  return normalizers;
}
