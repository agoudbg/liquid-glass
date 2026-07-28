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
    expect(style).toContain('.liquid-glass-material > *');
    expect(style).toContain(
      '.liquid-glass-material > .liquid-glass-dedicated-canvas {',
    );
    expect(style).toMatch(
      /\.liquid-glass-material > \.liquid-glass-dedicated-canvas\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/u,
    );
    expect(style).toMatch(
      /\.liquid-glass-material > \.liquid-glass-dedicated-canvas\s*\{[^}]*z-index:\s*-1;/u,
    );
    expect(style).not.toContain(
      '.liquid-glass-material > .liquid-glass-content',
    );
    expect(style).toContain(".liquid-glass-material[is-fallback-mode='true'] {");
    expect(style).not.toContain(
      ".liquid-glass-container[data-lg-fallback='true'] .liquid-glass-material",
    );
    expect(style).not.toContain('0 16px 44px rgba(15, 23, 42, 0.16)');
    expect(style).not.toContain('--lg-highlight-size, 160px');
  });

  it('preserves the legacy oracle typography on direct slot children', () => {
    const style = readFileSync(ORACLE_STYLE_URL, 'utf8');

    expect(style).toMatch(
      /\.oracle-material\s*\{[^}]*gap:\s*8px;/u,
    );
    expect(style).not.toMatch(
      /\.oracle-material\s*\{[^}]*\bcolor\s*:/u,
    );
    expect(style).toMatch(
      /\.oracle-material > span\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*400;/u,
    );
    expect(style).not.toMatch(
      /\.oracle-material \.material-copy/u,
    );
  });
});
