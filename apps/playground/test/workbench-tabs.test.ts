import { describe, expect, it } from 'vitest';

import {
  getWorkbenchTabDefaultScene,
  isWorkbenchTab,
  resolveWorkbenchTab,
  WORKBENCH_TABS,
} from '../src/shared/workbench-tabs';

describe('workbench tabs', () => {
  it('derives current tabs without storing duplicate URL state', () => {
    expect(resolveWorkbenchTab('S001')).toBe('lab');
    expect(resolveWorkbenchTab('S002')).toBe('materials');
    expect(resolveWorkbenchTab('S004')).toBe('materials');
    expect(resolveWorkbenchTab('S003')).toBe('composition');
    expect(resolveWorkbenchTab('S005')).toBe('composition');
    expect(resolveWorkbenchTab('S006')).toBe('composition');
    expect(resolveWorkbenchTab('S007')).toBe('composition');
    expect(resolveWorkbenchTab('S012')).toBe('composition');
    expect(resolveWorkbenchTab('S099')).toBe('composition');
  });

  it('uses deterministic entry scenes for each tab', () => {
    expect(WORKBENCH_TABS.map(({ id }) => id)).toEqual([
      'materials',
      'lab',
      'composition',
    ]);
    expect(getWorkbenchTabDefaultScene('lab')).toBe('S001');
    expect(getWorkbenchTabDefaultScene('materials')).toBe('S002');
    expect(getWorkbenchTabDefaultScene('composition')).toBe('S008');
    expect(isWorkbenchTab('lab')).toBe(true);
    expect(isWorkbenchTab('unknown')).toBe(false);
  });
});
