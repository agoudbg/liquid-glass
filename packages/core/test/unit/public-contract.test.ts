import { describe, expectTypeOf, it } from 'vitest';

import type {
  BackdropSourceHandle,
  CanvasBackdropSourceConfig,
  DomBackdropSourceConfig,
  GlassContext,
  GlassContextOptions,
  MaterialChanges,
  MaterialFeedback,
  MaterialHandle,
  MaterialPresentationState,
  ProxyInterface,
} from '../../src/index';

describe('public core contract', () => {
  it('returns lifecycle handles from resource registrations', () => {
    expectTypeOf<GlassContext>().toMatchTypeOf<{
      addBackdropSource(
        config: DomBackdropSourceConfig,
      ): BackdropSourceHandle<DomBackdropSourceConfig>;
      addBackdropSource(
        config: CanvasBackdropSourceConfig,
      ): BackdropSourceHandle<CanvasBackdropSourceConfig>;
      addMaterial(config: Parameters<GlassContext['addMaterial']>[0]): MaterialHandle;
      updateOptions(options: GlassContextOptions): void;
    }>();

    expectTypeOf<CanvasBackdropSourceConfig['element']>()
      .toEqualTypeOf<HTMLCanvasElement>();
    expectTypeOf<CanvasBackdropSourceConfig['boundsElement']>()
      .toEqualTypeOf<HTMLElement | undefined>();
    expectTypeOf<CanvasBackdropSourceConfig['mirrorToElement']>()
      .toEqualTypeOf<boolean | undefined>();

    expectTypeOf<ReturnType<ProxyInterface['registerExternalMaterial']>>().toMatchTypeOf<{
      readonly id: string;
      readonly destroyed: boolean;
      destroy(): void;
    }>();
  });

  it('keeps ownership fields immutable after registration', () => {
    expectTypeOf<
      Parameters<BackdropSourceHandle<DomBackdropSourceConfig>['update']>[0]
    >().toEqualTypeOf<Partial<Omit<DomBackdropSourceConfig, 'element' | 'kind'>>>();

    expectTypeOf<
      Parameters<BackdropSourceHandle<CanvasBackdropSourceConfig>['update']>[0]
    >().toEqualTypeOf<Partial<Omit<CanvasBackdropSourceConfig, 'element' | 'kind'>>>();

    expectTypeOf<Parameters<MaterialHandle['update']>[0]>().toEqualTypeOf<MaterialChanges>();
    expectTypeOf<ReturnType<MaterialHandle['getPresentation']>>()
      .toEqualTypeOf<MaterialPresentationState>();
    expectTypeOf<ReturnType<MaterialHandle['onPresentation']>>()
      .toEqualTypeOf<() => void>();
  });

  it('uses discriminated feedback instead of untyped payload data', () => {
    expectTypeOf<MaterialFeedback>().toEqualTypeOf<
      | { type: 'inserted' }
      | { type: 'removed' }
      | { type: 'moved' }
      | { type: 'resized' }
      | {
          type: 'theme-changed';
          themeColorMode: 'light' | 'dark' | 'ultra_light' | 'ultra_dark';
          averageLuminance?: number;
        }
    >();
  });
});
