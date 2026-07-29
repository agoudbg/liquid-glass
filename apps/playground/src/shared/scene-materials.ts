import { resolveCanonicalSceneMaterials } from './canonical-scene-materials';
import {
  isCompositionScene,
  resolveCompositionMaterials,
} from './composition-scenes';
import { resolveInteractionMaterials } from './interaction-materials';
import { resolveInteractionPolicyMaterials } from './interaction-policy-materials';
import { resolveLabMaterials } from './lab-materials';
import { resolveOracleMaterials } from './oracle-materials';
import type { SceneMaterial } from './scene-material-types';
import { isInteractionPolicyFixture } from './test-fixtures';
import type { PlaygroundState } from './types';

/** Resolve one isolated Lab, canonical, fixture, or oracle material set. */
export function resolveSceneMaterials(state: PlaygroundState): readonly SceneMaterial[] {
  if (state.oracleMode) return resolveOracleMaterials(state.scene);
  if (isCompositionScene(state.scene)) {
    return resolveCompositionMaterials(state.scene);
  }
  if (state.scene === 'S001') return resolveLabMaterials(state.lab);
  if (state.scene === 'S004') {
    return isInteractionPolicyFixture(state)
      ? resolveInteractionPolicyMaterials()
      : resolveInteractionMaterials();
  }
  return resolveCanonicalSceneMaterials(state.scene);
}
