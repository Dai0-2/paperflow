import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/store/useAppStore';

describe('AI provider switching', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      providerMode: 'chatgpt',
      model: 'ChatGPT via Codex',
    });
  });

  it('restores the model saved for each provider when switching both ways', () => {
    useAppStore.getState().setModel('codex-model-override');
    useAppStore.getState().setProviderMode('api');
    expect(useAppStore.getState().model).toBe('gpt-4.1-mini');

    useAppStore.getState().setModel('relay/model-v2');
    useAppStore.getState().setProviderMode('chatgpt');
    expect(useAppStore.getState().model).toBe('codex-model-override');

    useAppStore.getState().setProviderMode('api');
    expect(useAppStore.getState().model).toBe('relay/model-v2');
    expect(localStorage.getItem('paperflow:provider')).toBe('api');
    expect(localStorage.getItem('paperflow:codex-model')).toBe('codex-model-override');
    expect(localStorage.getItem('paperflow:api-model')).toBe('relay/model-v2');
  });
});
