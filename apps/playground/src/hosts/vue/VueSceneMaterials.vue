<script setup lang="ts">
import { LiquidGlassMaterial } from '@agou/liquid-glass-vue';

import type { SceneMaterial } from '../../shared/scene-material-types';
import InteractionFixtureControl from './InteractionFixtureControl.vue';

interface Props {
  materials: readonly SceneMaterial[];
  oracleMode: boolean;
}

defineProps<Props>();
</script>

<template>
  <LiquidGlassMaterial
    v-for="(material, index) in materials"
    :key="material.id"
    v-bind="material.options"
    :class="material.className"
    :data-interaction-preset="material.options.interactionPreset"
    :data-material-id="material.id"
    :data-oracle-material="oracleMode ? material.id : undefined"
    :data-testid="material.testId ?? (index === 0 ? 'primary-material' : undefined)"
  >
    <template v-if="oracleMode">
      <template v-if="material.detail">
        <strong>{{ material.name }}</strong>
        <span>{{ material.detail }}</span>
      </template>
      <template v-else>{{ material.name }}</template>
    </template>
    <InteractionFixtureControl
      v-else-if="material.control"
      :control="material.control"
    />
    <div
      v-else
      class="material-copy"
    >
      <span>{{ material.label }}</span>
      <strong>{{ material.name }}</strong>
      <small>
        {{ material.options.thickness }} px ·
        {{ material.options.refractIndex?.toFixed(2) }} IOR
      </small>
    </div>
  </LiquidGlassMaterial>
</template>
