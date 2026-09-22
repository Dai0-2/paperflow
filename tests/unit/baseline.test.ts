import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('provides browser-compatible crypto and IndexedDB globals', () => {
    expect(globalThis.indexedDB).toBeDefined();
    expect(globalThis.crypto).toBeDefined();
  });
});
