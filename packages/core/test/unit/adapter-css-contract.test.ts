import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const ADAPTER_STYLE_URLS = [
  new URL('../../../vue/src/styles/glass.css', import.meta.url),
  new URL('../../../react/src/styles/glass.css', import.meta.url),
  new URL('../../../solid/src/styles/glass.css', import.meta.url),
];
const ORACLE_STYLE_URL = new URL(
  '../../../../apps/playground/src/styles/oracle.css',
  import.meta.url,
);

describe('adapter material CSS contract', () => {
  it('ships one byte-identical material appearance stylesheet in every adapter', () => {
    const styles = ADAPTER_STYLE_URLS.map((url) => readFileSync(url, 'utf8'));

    expect(new Set(styles).size).toBe(1);
  });

  it('preserves appearance tokens without adding adapter-only shadows', () => {
    const style = readFileSync(ADAPTER_STYLE_URLS[0], 'utf8');

    expect(style).toContain('color: var(--lg-foreground-color);');
    expect(style).toContain('--lg-inset-shadow-size: 10px;');
    expect(style).toContain('--lg-outer-shadow-size: 10px;');
    expect(style).not.toContain(
      'inset 0 0 var(--lg-inset-shadow-size) var(--lg-inset-shadow-color)',
    );
    expect(style).not.toContain(
      '0 0 var(--lg-outer-shadow-size) var(--lg-outer-shadow-color)',
    );
    expect(style).not.toContain('box-shadow 0.2s ease');
    expect(style).not.toContain('box-shadow 0.5s ease');
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

  it('restores S001 strong text without changing S002 or S004', () => {
    const style = readFileSync(ORACLE_STYLE_URL, 'utf8');

    expect(style).toMatch(
      /\.oracle-s001 \.material-copy strong\s*\{\s*font-weight:\s*bolder;\s*\}/u,
    );
    expect(style).toMatch(
      /\.oracle-material \.material-copy strong\s*\{[^}]*font-weight:\s*700;/u,
    );
    expect(style).not.toMatch(
      /\.oracle-(?:multi|s004)[^{]*\{[^}]*font-weight\s*:/u,
    );
  });
});
