/** @jsxImportSource react */
import { useState } from 'react';

import type { SceneMaterialControl } from '../../shared/scene-material-types';

interface InteractionFixtureControlProps {
  /** Native control definition owned by the shared fixture model. */
  control: SceneMaterialControl;
}

/** Render a framework-owned native descendant for interaction-policy tests. */
export function InteractionFixtureControl({
  control,
}: InteractionFixtureControlProps): React.JSX.Element {
  const [clickCount, setClickCount] = useState(0);
  const [rangeValue, setRangeValue] = useState(
    control.kind === 'range' ? control.initialValue : 0,
  );

  if (control.kind === 'button') {
    return (
      <div className="interaction-policy-control">
        <span>NATIVE BUTTON</span>
        <button
          className="interaction-policy-button"
          data-click-count={clickCount}
          data-testid={control.testId}
          type="button"
          onClick={() => setClickCount((count) => count + 1)}
        >
          {control.label}
        </button>
        <small>{clickCount} clicks</small>
      </div>
    );
  }

  return (
    <label className="interaction-policy-control">
      <span>{control.label}</span>
      <input
        aria-label={control.label}
        className="interaction-policy-range"
        data-current-value={rangeValue}
        data-testid={control.testId}
        max="100"
        min="0"
        type="range"
        value={rangeValue}
        onChange={(event) => setRangeValue(Number(event.currentTarget.value))}
      />
      <small>{rangeValue} / 100</small>
    </label>
  );
}
