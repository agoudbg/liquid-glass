/** Supported framework hosts in stable presentation order. */
export const FRAMEWORK_IDS = ['vue', 'react', 'solid'] as const;

/** Framework identifier accepted by the playground host switcher. */
export type FrameworkId = (typeof FRAMEWORK_IDS)[number];

/** Product name shown by the playground shell. */
export const PLAYGROUND_NAME = 'Liquid Glass Playground';

/** Determine whether an unknown value names a supported framework host. */
export function isFrameworkId(value: unknown): value is FrameworkId {
  return typeof value === 'string'
    && FRAMEWORK_IDS.some((framework) => framework === value);
}
