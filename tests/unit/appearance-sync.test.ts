import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store/useAppStore';

describe('appearance preference synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      theme: 'zotero',
      fontFamily: 'system',
      fontScale: 100,
    });
  });

  it('updates an open page when another PaperFlow page changes appearance', () => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'paperflow:theme',
      newValue: 'dark',
    }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'paperflow:font-family',
      newValue: 'serif',
    }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'paperflow:font-scale',
      newValue: '125',
    }));

    expect(useAppStore.getState()).toMatchObject({
      theme: 'dark',
      fontFamily: 'serif',
      fontScale: 125,
    });
  });

  it('ignores unsupported theme values and clamps text scale', () => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'paperflow:theme',
      newValue: 'sepia',
    }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'paperflow:font-scale',
      newValue: '240',
    }));

    expect(useAppStore.getState().theme).toBe('zotero');
    expect(useAppStore.getState().fontScale).toBe(160);
  });
});
