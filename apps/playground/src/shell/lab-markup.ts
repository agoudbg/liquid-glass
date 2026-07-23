import {
  LAB_RANGE_GROUPS,
  type LabRangeControl,
  type LabRangeGroup,
} from '../shared/lab-control-model';

const rangeGroups = new Map(
  LAB_RANGE_GROUPS.map((group) => [group.id, group]),
);

/** Complete focused Lab inspector rendered only for editable S001. */
export const LAB_INSPECTOR_MARKUP = `
  <div class="lab-panel" data-lab-panel>
    <div class="lab-toolbar">
      <div class="mode-control lab-source-control">
        <span>Source</span>
        <div class="segment-control" aria-label="Backdrop source">
          <button type="button" data-lab-source="canvas">Canvas</button>
          <button type="button" data-lab-source="dom">DOM</button>
        </div>
      </div>
      <div class="lab-icon-actions" aria-label="Lab actions">
        <button type="button" data-action="reset-lab" title="Reset Lab" aria-label="Reset Lab">
          <span aria-hidden="true">&#8634;</span>
        </button>
        <button type="button" data-action="refresh-lab-backdrop" title="Refresh backdrop" aria-label="Refresh backdrop">
          <span aria-hidden="true">&#10227;</span>
        </button>
        <button type="button" data-action="copy-url" title="Copy reproducible URL" aria-label="Copy reproducible URL">
          <span aria-hidden="true">&#10697;</span>
        </button>
      </div>
      <output class="copy-status" data-copy-status aria-live="polite"></output>
    </div>

    ${renderRangeGroup(requireRangeGroup('optics'))}
    ${renderRangeGroup(requireRangeGroup('shape'))}

    <section class="lab-control-group" aria-labelledby="appearance-heading">
      <h3 id="appearance-heading">Appearance</h3>
      <label class="check-control">
        <input type="checkbox" data-lab-boolean="useCustomColor" />
        <span>Custom tint</span>
      </label>
      <div class="color-control">
        <span>Color</span>
        <div class="color-swatches" aria-label="Material tint">
          <button type="button" data-lab-color="#d9f2ea29" style="--swatch: #d9f2ea" aria-label="Sea glass tint" title="Sea glass"></button>
          <button type="button" data-lab-color="#f5c9ba29" style="--swatch: #f5c9ba" aria-label="Coral tint" title="Coral"></button>
          <button type="button" data-lab-color="#f2dd8a29" style="--swatch: #f2dd8a" aria-label="Sun tint" title="Sun"></button>
          <button type="button" data-lab-color="#bfc9e829" style="--swatch: #bfc9e8" aria-label="Periwinkle tint" title="Periwinkle"></button>
        </div>
        <label class="color-input" title="Custom tint color">
          <span class="sr-only">Custom tint color</span>
          <input type="color" data-lab-color-input value="#d9f2ea" />
        </label>
      </div>
      ${renderRangeControls(requireRangeGroup('appearance'))}
    </section>

    <section class="lab-control-group" aria-labelledby="interaction-heading">
      <h3 id="interaction-heading">Interaction</h3>
      <label class="select-control" for="interaction-control">
        <span>Preset</span>
        <select id="interaction-control" data-lab-interaction>
          <option value="button">Button</option>
          <option value="context-menu">Context menu</option>
          <option value="slider">Slider</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <div class="check-grid">
        <label class="check-control">
          <input type="checkbox" data-lab-boolean="disableInteractions" />
          <span>Disabled</span>
        </label>
        <label class="check-control">
          <input type="checkbox" data-lab-boolean="onlyClickInteractions" />
          <span>Click only</span>
        </label>
        <label class="check-control">
          <input type="checkbox" data-lab-boolean="isMoveable" />
          <span>Moveable host</span>
        </label>
      </div>
      <div data-lab-custom>
        ${renderRangeControls(requireRangeGroup('custom'))}
      </div>
    </section>

    ${renderRangeGroup(requireRangeGroup('render'))}
  </div>
`;

function requireRangeGroup(id: LabRangeGroup['id']): LabRangeGroup {
  const group = rangeGroups.get(id);
  if (!group) throw new Error(`Missing Lab range group: ${id}`);
  return group;
}

function renderRangeGroup(group: LabRangeGroup): string {
  return `
    <section class="lab-control-group" aria-labelledby="${group.id}-heading">
      <h3 id="${group.id}-heading">${group.label}</h3>
      ${renderRangeControls(group)}
    </section>
  `;
}

function renderRangeControls(group: LabRangeGroup): string {
  return group.controls.map(renderRangeControl).join('');
}

function renderRangeControl(control: LabRangeControl): string {
  const inputId = `${control.id}-control`;
  return `
    <label class="range-control" for="${inputId}">
      <span>${control.label}</span>
      <output data-lab-output="${control.id}" for="${inputId}"></output>
      <input
        id="${inputId}"
        data-lab-number="${control.id}"
        type="range"
        min="${String(control.minimum)}"
        max="${String(control.maximum)}"
        step="${String(control.step)}"
      />
    </label>
  `;
}
