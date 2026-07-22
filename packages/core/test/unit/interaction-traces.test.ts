import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  createCustomEngine,
  InteractionEngine,
  type InteractionEngineState,
  type InteractionPreset,
  type InteractionTransform,
  type PointerData,
} from '../../src/interaction';

type TraceName = InteractionPreset;
type Pair = [number, number];

interface FixtureOperation {
  operation:
    | 'step'
    | 'pointer-enter'
    | 'pointer-move'
    | 'pointer-down'
    | 'pointer-up';
  timestampMs?: number;
  clockMs?: number;
  client?: Pair;
  normalized?: Pair;
  pointerType?: string;
  pointerId?: number;
  sample?: string;
}

interface TraceSample {
  event: string;
  phase: string;
  transform: number[];
  backgroundColor: string | null;
  highlightVisible: boolean;
  targets: number[];
  pointerVelocity: number[];
}

interface PhysicsTrace {
  name: TraceName;
  samples: TraceSample[];
}

interface PhysicsFixture {
  comparisonAbsoluteTolerance: number;
  transformFields: string[];
  targetFields: string[];
  elementSize: Pair;
  sequence: {
    operations: FixtureOperation[];
  };
  traces: PhysicsTrace[];
}

const fixtureUrl = new URL(
  '../../../../tests/baselines/legacy/physics-traces.json',
  import.meta.url,
);
const fixture = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as PhysicsFixture;

const customOverrides = {
  preset: 'custom' as const,
  hoverScale: 1.01,
  activeScale: 1.08,
  maxScale: 1.4,
  translateFactor: 0.1,
  stretchFactor: 0.0006,
  originShiftSensitivity: 0.4,
  activeSpring: { stiffness: 240, damping: 16, mass: 1 },
  releaseSpring: { stiffness: 200, damping: 10, mass: 1 },
  highlightFollowSpeed: 0.25,
};

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${label} in physics trace operation.`);
  }
  return value;
}

function createTraceEngine(name: TraceName): InteractionEngine {
  return name === 'custom'
    ? createCustomEngine(customOverrides)
    : new InteractionEngine(name);
}

function toPointerData(operation: FixtureOperation): PointerData {
  const client = requireValue(operation.client, 'client coordinates');
  const normalized = operation.normalized;
  return {
    clientX: client[0],
    clientY: client[1],
    pointerId: operation.pointerId,
    pointerType: operation.pointerType,
    normalizedX: normalized?.[0],
    normalizedY: normalized?.[1],
  };
}

function transformValues(transform: InteractionTransform): number[] {
  return [
    transform.scaleX,
    transform.scaleY,
    transform.translateX,
    transform.translateY,
    transform.originX,
    transform.originY,
    transform.opacity,
    transform.highlightX,
    transform.highlightY,
  ];
}

function targetValues(state: InteractionEngineState): number[] {
  return [
    state.targetScaleX,
    state.targetScaleY,
    state.targetTranslateX,
    state.targetTranslateY,
    state.targetOriginX,
    state.targetOriginY,
  ];
}

function expectScalarsWithinTolerance(
  actual: number[],
  expected: number[],
  fields: string[],
  tolerance: number,
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(
      Math.abs(value - requireValue(expected[index], `expected ${fields[index]}`)),
      fields[index],
    ).toBeLessThanOrEqual(tolerance);
  });
}

function verifySample(
  transform: InteractionTransform,
  state: InteractionEngineState,
  expected: TraceSample,
): void {
  expect(state.phase).toBe(expected.phase);
  expect(transform.backgroundColor).toBe(expected.backgroundColor);
  expect(transform.highlightVisible).toBe(expected.highlightVisible);
  expect(transform.isActive).toBe(state.isPointerDown);
  expectScalarsWithinTolerance(
    transformValues(transform),
    expected.transform,
    fixture.transformFields,
    fixture.comparisonAbsoluteTolerance,
  );
  expectScalarsWithinTolerance(
    targetValues(state),
    expected.targets,
    fixture.targetFields,
    fixture.comparisonAbsoluteTolerance,
  );
  expectScalarsWithinTolerance(
    [state.pointerVelocityX, state.pointerVelocityY],
    expected.pointerVelocity,
    ['pointerVelocityX', 'pointerVelocityY'],
    fixture.comparisonAbsoluteTolerance,
  );
}

function replayTrace(trace: PhysicsTrace): number {
  const engine = createTraceEngine(trace.name);
  engine.setElementSize(...fixture.elementSize);
  let clockMs = 0;
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => clockMs);
  const samplesByName = new Map(
    trace.samples.map((sample) => [sample.event, sample]),
  );
  let verifiedSamples = 0;

  try {
    for (const operation of fixture.sequence.operations) {
      clockMs = operation.clockMs ?? clockMs;
      switch (operation.operation) {
        case 'pointer-enter':
          engine.onPointerEnter(toPointerData(operation));
          break;
        case 'pointer-move':
          engine.onPointerMove(toPointerData(operation));
          break;
        case 'pointer-down':
          engine.onPointerDown(toPointerData(operation));
          break;
        case 'pointer-up':
          engine.onPointerUp();
          break;
        case 'step': {
          const transform = engine.step(requireValue(
            operation.timestampMs,
            'step timestamp',
          ));
          if (operation.sample !== undefined) {
            verifySample(
              transform,
              engine.getState(),
              requireValue(samplesByName.get(operation.sample), operation.sample),
            );
            verifiedSamples += 1;
          }
          break;
        }
      }
    }
  } finally {
    engine.destroy();
    nowSpy.mockRestore();
  }

  return verifiedSamples;
}

describe('legacy interaction physics traces', () => {
  it.each(fixture.traces)(
    'replays every $name scalar sample within the recorded tolerance',
    (trace) => {
      expect(replayTrace(trace)).toBe(trace.samples.length);
    },
  );

  it('contains the complete 24-sample parity oracle', () => {
    expect(fixture.traces.reduce(
      (total, trace) => total + trace.samples.length,
      0,
    )).toBe(24);
  });
});
