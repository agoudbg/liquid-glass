/** Canonical visible scenes exposed by the optical workbench. */
export const SCENE_IDS = [
  'S001',
  'S002',
  'S003',
  'S005',
  'S006',
  'S007',
] as const;

/** Canonical visible scene identifier. */
export type SceneId = (typeof SCENE_IDS)[number];

/** Backdrop behavior required by one canonical scene. */
export type SceneCaptureKind = 'body-scroll' | 'canvas' | 'dom' | 'internal-scroll';

/** Framework-neutral metadata and default policies for one playground scene. */
export interface SceneDefinition {
  /** Stable URL and test identifier. */
  readonly id: SceneId;
  /** Human-readable scene name. */
  readonly title: string;
  /** Number of public adapter materials rendered by the scene. */
  readonly materialCount: number;
  /** Backdrop implementation used by every framework host. */
  readonly captureKind: SceneCaptureKind;
  /** Compact source label rendered over the stage. */
  readonly stageSource: string;
  /** Whether entering the scene requests CSS fallback by default. */
  readonly fallbackByDefault: boolean;
  /** Whether entering the scene enables a scrollable glass context. */
  readonly scrollableByDefault: boolean;
  /** Whether entering the scene enables viewport-limited capture. */
  readonly viewportByDefault: boolean;
  /** Whether deterministic legacy oracle geometry is available. */
  readonly supportsOracle: boolean;
}

const SCENE_DEFINITIONS_BY_ID = {
  S001: {
    id: 'S001',
    title: 'Single material',
    materialCount: 1,
    captureKind: 'canvas',
    stageSource: '01 / CUSTOM CANVAS',
    fallbackByDefault: false,
    scrollableByDefault: false,
    viewportByDefault: false,
    supportsOracle: true,
  },
  S002: {
    id: 'S002',
    title: 'Material overlap',
    materialCount: 3,
    captureKind: 'canvas',
    stageSource: '01 / CUSTOM CANVAS',
    fallbackByDefault: false,
    scrollableByDefault: false,
    viewportByDefault: false,
    supportsOracle: true,
  },
  S003: {
    id: 'S003',
    title: 'DOM capture',
    materialCount: 1,
    captureKind: 'dom',
    stageSource: '01 / DOM SOURCE',
    fallbackByDefault: false,
    scrollableByDefault: false,
    viewportByDefault: false,
    supportsOracle: false,
  },
  S005: {
    id: 'S005',
    title: 'Body scroll',
    materialCount: 1,
    captureKind: 'body-scroll',
    stageSource: '05 / BODY SCROLL',
    fallbackByDefault: false,
    scrollableByDefault: false,
    viewportByDefault: false,
    supportsOracle: false,
  },
  S006: {
    id: 'S006',
    title: 'Internal scroll',
    materialCount: 1,
    captureKind: 'internal-scroll',
    stageSource: '06 / VIEWPORT CAPTURE',
    fallbackByDefault: false,
    scrollableByDefault: true,
    viewportByDefault: true,
    supportsOracle: false,
  },
  S007: {
    id: 'S007',
    title: 'Fallback recovery',
    materialCount: 1,
    captureKind: 'canvas',
    stageSource: '01 / CUSTOM CANVAS',
    fallbackByDefault: true,
    scrollableByDefault: false,
    viewportByDefault: false,
    supportsOracle: false,
  },
} satisfies Readonly<Record<SceneId, SceneDefinition>>;

/** Ordered scene definitions used by navigation and tests. */
export const SCENE_DEFINITIONS: readonly SceneDefinition[] = SCENE_IDS.map(
  (id) => SCENE_DEFINITIONS_BY_ID[id],
);

/** Narrow an unknown value to a supported scene identifier. */
export function isSceneId(value: unknown): value is SceneId {
  return typeof value === 'string' && SCENE_IDS.includes(value as SceneId);
}

/** Resolve immutable metadata for one supported scene. */
export function getSceneDefinition(scene: SceneId): SceneDefinition {
  return SCENE_DEFINITIONS_BY_ID[scene];
}
