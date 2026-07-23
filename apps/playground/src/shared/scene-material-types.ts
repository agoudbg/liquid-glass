import type {
  MaterialAppearanceOptions,
  MaterialConfig,
} from '@agou/liquid-glass-core';

/** Material options accepted consistently by all three public adapters. */
export interface SceneMaterialOptions
  extends Omit<MaterialConfig, 'element'>,
  MaterialAppearanceOptions {}

/** Native controls used to prove descendant event interoperability. */
export type SceneMaterialControl =
  | {
    /** Render a native button with an observable framework-owned click count. */
    kind: 'button';
    /** Accessible control label. */
    label: string;
    /** Stable browser-test identifier. */
    testId: string;
  }
  | {
    /** Render a native range input with an observable framework-owned value. */
    kind: 'range';
    /** Accessible control label. */
    label: string;
    /** Initial range value. */
    initialValue: number;
    /** Stable browser-test identifier. */
    testId: string;
  };

/** Framework-neutral material definition rendered by every host. */
export interface SceneMaterial {
  /** Stable reconciliation and diagnostic identifier. */
  id: string;
  /** CSS placement class shared across hosts. */
  className: string;
  /** Compact material label rendered above the optical values. */
  label: string;
  /** Secondary material label. */
  name: string;
  /** Optional compact detail used by the exact legacy oracle. */
  detail?: string;
  /** Optional stable browser-test identifier for a primary interaction target. */
  testId?: string;
  /** Optional native control rendered only by a gated browser-test fixture. */
  control?: SceneMaterialControl;
  /** Public adapter options for this material. */
  options: SceneMaterialOptions;
}
