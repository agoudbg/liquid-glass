import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ADAPTER_STYLE_URLS = [
  new URL('../../../vue/src/styles/glass.css', import.meta.url),
  new URL('../../../react/src/styles/glass.css', import.meta.url),
  new URL('../../../solid/src/styles/glass.css', import.meta.url),
];

describe('adapter material CSS contract', () => {
  it('ships one byte-identical material appearance stylesheet in every adapter', () => {
    const styles = ADAPTER_STYLE_URLS.map((url) => readFileSync(url, 'utf8'));

    expect(new Set(styles).size).toBe(1);
  });

  it('uses the complete legacy appearance token contract', () => {
    const style = readFileSync(ADAPTER_STYLE_URLS[0], 'utf8');

    expect(style).toContain('color: var(--lg-foreground-color);');
    expect(style).toContain('inset 0 0 var(--lg-inset-shadow-size) var(--lg-inset-shadow-color)');
    expect(style).toContain('0 0 var(--lg-outer-shadow-size) var(--lg-outer-shadow-color)');
    expect(style).toContain('background: var(--lg-illumination-gradient);');
    expect(style).toContain('mix-blend-mode: screen;');
    expect(style).toContain('filter: var(--lg-highlight-filter);');
    expect(style).toContain('scale(var(--lg-highlight-scale))');
    expect(style).toContain(".liquid-glass-material[is-fallback-mode='true'] {");
    expect(style).not.toContain(
      ".liquid-glass-container[data-lg-fallback='true'] .liquid-glass-material",
    );
    expect(style).not.toContain('0 16px 44px rgba(15, 23, 42, 0.16)');
    expect(style).not.toContain('--lg-highlight-size, 160px');
  });
});
