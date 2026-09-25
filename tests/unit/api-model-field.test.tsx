import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiModelField } from '../../src/components/setup/ApiModelField';
import { useAppStore } from '../../src/store/useAppStore';

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    providerMode: 'api',
    model: 'gpt-4.1-mini',
    apiModels: [],
    uiLanguage: 'en',
  });
});

afterEach(() => {
  cleanup();
});

describe('API model field', () => {
  it('shows plain model IDs and persists the selected model', async () => {
    render(<ApiModelField />);

    expect(screen.getByRole('option', { name: 'gpt-5.5' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'gpt-5.6' })).toBeInTheDocument();
    expect(screen.queryByText(/Get-Codex/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Model ID'), 'gpt-5.6');

    expect(useAppStore.getState().model).toBe('gpt-5.6');
    expect(localStorage.getItem('paperflow:api-model')).toBe('gpt-5.6');
  });

  it('keeps custom OpenAI-compatible model IDs available', async () => {
    render(<ApiModelField />);

    await userEvent.selectOptions(screen.getByLabelText('Model ID'), '__custom__');
    await userEvent.type(screen.getByLabelText('Custom model ID'), 'relay/model-v2');

    expect(useAppStore.getState().model).toBe('relay/model-v2');
    expect(localStorage.getItem('paperflow:api-model')).toBe('relay/model-v2');
  });

  it('uses the models discovered from the configured provider', () => {
    useAppStore.setState({
      model: 'deepseek-chat',
      apiModels: ['deepseek-chat', 'deepseek-reasoner'],
    });

    render(<ApiModelField />);

    expect(screen.getByRole('option', { name: 'deepseek-chat' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'deepseek-reasoner' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'gpt-5.5' })).not.toBeInTheDocument();
  });
});
