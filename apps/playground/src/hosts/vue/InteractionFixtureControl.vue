<script setup lang="ts">
import { ref } from 'vue';

import type { SceneMaterialControl } from '../../shared/scene-material-types';

const props = defineProps<{
  /** Native control definition owned by the shared fixture model. */
  control: SceneMaterialControl;
}>();
const clickCount = ref(0);
const rangeValue = ref(
  props.control.kind === 'range' ? props.control.initialValue : 0,
);

function updateRange(event: Event): void {
  if (!(event.currentTarget instanceof HTMLInputElement)) return;
  rangeValue.value = Number(event.currentTarget.value);
}
</script>

<template>
  <div
    v-if="control.kind === 'button'"
    class="interaction-policy-control"
  >
    <span>NATIVE BUTTON</span>
    <button
      class="interaction-policy-button"
      :data-click-count="clickCount"
      :data-testid="control.testId"
      type="button"
      @click="clickCount += 1"
    >
      {{ control.label }}
    </button>
    <small>{{ clickCount }} clicks</small>
  </div>
  <label
    v-else
    class="interaction-policy-control"
  >
    <span>{{ control.label }}</span>
    <input
      :aria-label="control.label"
      class="interaction-policy-range"
      :data-current-value="rangeValue"
      :data-testid="control.testId"
      max="100"
      min="0"
      type="range"
      :value="rangeValue"
      @input="updateRange"
    >
    <small>{{ rangeValue }} / 100</small>
  </label>
</template>
