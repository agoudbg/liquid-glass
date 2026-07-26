import {
  expectRecord,
  readNonNegativeInteger,
  readPositiveInteger,
  readRatio,
  readString,
} from './legacy-visual-schema';

interface StaticScenarioState {
  kind: 'static';
}

interface ManualRefreshScenarioState {
  controlTestId: string;
  kind: 'manual-refresh';
  settleMilliseconds: number;
}

interface PointerHoldScenarioState {
  holdSettleMilliseconds: number;
  hoverSettleMilliseconds: number;
  kind: 'pointer-hold';
  targetTestId: string;
  xRatio: number;
  yRatio: number;
}

interface WindowScrollScenarioState {
  kind: 'window-scroll';
  settleMilliseconds: number;
  x: number;
  y: number;
}

interface InternalScrollScenarioState {
  kind: 'internal-scroll';
  scrollTop: number;
  selector: string;
  settleMilliseconds: number;
}

/** Deterministic scene preparation captured alongside one visual baseline. */
export type LegacyVisualScenarioState =
  | StaticScenarioState
  | ManualRefreshScenarioState
  | PointerHoldScenarioState
  | WindowScrollScenarioState
  | InternalScrollScenarioState;

const EXPECTED_KIND_BY_SCENARIO: Readonly<Record<string, string>> = {
  S001: 'static',
  S002: 'static',
  S003: 'manual-refresh',
  S004: 'pointer-hold',
  S005: 'window-scroll',
  S006: 'internal-scroll',
};

/**
 * Parse one captured preparation recipe and bind its kind to the scene id.
 */
export function parseLegacyVisualScenarioState(
  value: unknown,
  scenarioId: string,
  label: string,
): LegacyVisualScenarioState {
  expectRecord(value, label);
  const kind = readString(value.kind, `${label}.kind`);
  if (kind !== EXPECTED_KIND_BY_SCENARIO[scenarioId]) {
    throw new Error(`${label}.kind does not match ${scenarioId}.`);
  }
  if (kind === 'static') return { kind };
  if (kind === 'manual-refresh') {
    return {
      controlTestId: readString(
        value.controlTestId,
        `${label}.controlTestId`,
      ),
      kind,
      settleMilliseconds: readPositiveInteger(
        value.settleMilliseconds,
        `${label}.settleMilliseconds`,
      ),
    };
  }
  if (kind === 'pointer-hold') {
    return {
      holdSettleMilliseconds: readPositiveInteger(
        value.holdSettleMilliseconds,
        `${label}.holdSettleMilliseconds`,
      ),
      hoverSettleMilliseconds: readPositiveInteger(
        value.hoverSettleMilliseconds,
        `${label}.hoverSettleMilliseconds`,
      ),
      kind,
      targetTestId: readString(
        value.targetTestId,
        `${label}.targetTestId`,
      ),
      xRatio: readRatio(value.xRatio, `${label}.xRatio`),
      yRatio: readRatio(value.yRatio, `${label}.yRatio`),
    };
  }
  if (kind === 'window-scroll') {
    const x = readNonNegativeInteger(value.x, `${label}.x`);
    const y = readNonNegativeInteger(value.y, `${label}.y`);
    return {
      kind,
      settleMilliseconds: readPositiveInteger(
        value.settleMilliseconds,
        `${label}.settleMilliseconds`,
      ),
      x,
      y,
    };
  }
  if (kind === 'internal-scroll') {
    return {
      kind,
      scrollTop: readPositiveInteger(value.scrollTop, `${label}.scrollTop`),
      selector: readString(value.selector, `${label}.selector`),
      settleMilliseconds: readPositiveInteger(
        value.settleMilliseconds,
        `${label}.settleMilliseconds`,
      ),
    };
  }
  throw new Error(`${label}.kind is unsupported.`);
}
