/** @jsxImportSource solid-js */
import { createSignal, Show, untrack } from 'solid-js';

import type { SceneMaterialControl } from '../../shared/scene-material-types';

interface InteractionFixtureControlProps {
  /** Native control definition owned by the shared fixture model. */
  control: SceneMaterialControl;
}

/** Render a framework-owned native descendant for interaction-policy tests. */
export function InteractionFixtureControl(
  props: InteractionFixtureControlProps,
): import('solid-js').JSX.Element {
  const [clickCount, setClickCount] = createSignal(0);
  const [rangeValue, setRangeValue] = createSignal(
    untrack(() => (
      props.control.kind === 'range' ? props.control.initialValue : 0
    )),
  );

  return (
    <Show
      when={props.control.kind === 'button' ? props.control : undefined}
      fallback={(
        <label class="interaction-policy-control">
          <span>{props.control.label}</span>
          <input
            aria-label={props.control.label}
            class="interaction-policy-range"
            data-current-value={rangeValue()}
            data-testid={props.control.testId}
            max="100"
            min="0"
            type="range"
            value={rangeValue()}
            onInput={(event) => setRangeValue(Number(event.currentTarget.value))}
          />
          <small>{rangeValue()} / 100</small>
        </label>
      )}
    >
      {(buttonControl) => (
        <div class="interaction-policy-control">
          <span>NATIVE BUTTON</span>
          <button
            class="interaction-policy-button"
            data-click-count={clickCount()}
            data-testid={buttonControl().testId}
            type="button"
            onClick={() => setClickCount((count) => count + 1)}
          >
            {buttonControl().label}
          </button>
          <small>{clickCount()} clicks</small>
        </div>
      )}
    </Show>
  );
}
