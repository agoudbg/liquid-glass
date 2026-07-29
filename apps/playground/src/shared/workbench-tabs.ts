import type { SceneId } from './scene-catalog';

/** Derived top-level workbench surfaces. */
export type WorkbenchTab = 'materials' | 'lab' | 'composition';

/** Ordered tabs rendered by the framework-neutral shell. */
export const WORKBENCH_TABS = [
  { id: 'materials', label: 'Materials', defaultScene: 'S002' },
  { id: 'lab', label: 'Lab', defaultScene: 'S001' },
  { id: 'composition', label: 'Composition', defaultScene: 'S008' },
] as const satisfies readonly {
  id: WorkbenchTab;
  label: string;
  defaultScene: SceneId;
}[];

/** Derive the active tab; unknown future scenes belong to Composition. */
export function resolveWorkbenchTab(scene: string): WorkbenchTab {
  if (scene === 'S001') return 'lab';
  if (scene === 'S002' || scene === 'S004') return 'materials';
  return 'composition';
}

/** Resolve the deterministic entry scene for a selected tab. */
export function getWorkbenchTabDefaultScene(tab: WorkbenchTab): SceneId {
  const definition = WORKBENCH_TABS.find(({ id }) => id === tab);
  if (!definition) {
    throw new Error(`Missing workbench tab definition: ${tab}`);
  }
  return definition.defaultScene;
}

/** Narrow a DOM data value to a supported workbench tab. */
export function isWorkbenchTab(value: string | undefined): value is WorkbenchTab {
  return value === 'materials' || value === 'lab' || value === 'composition';
}
