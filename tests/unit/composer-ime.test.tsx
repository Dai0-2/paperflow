import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Composer } from '../../src/components/composer/Composer';
import { useAppStore } from '../../src/store/useAppStore';

const mocks = vi.hoisted(() => ({
  submit: vi.fn(async () => {}),
}));

vi.mock('../../src/hooks/useChatActions', () => ({
  useChatActions: () => ({ submit: mocks.submit }),
}));

describe('Composer IME handling', () => {
  beforeEach(() => {
    mocks.submit.mockClear();
    useAppStore.setState({
      model: 'gpt-5.5',
      providerMode: 'api',
      uiLanguage: 'en',
      promptLanguage: 'en',
      draft: 'cao p d',
      paper: null,
      selection: null,
      bridgeState: 'connected',
      apiState: 'connected',
      attachments: [],
      sending: false,
    });
  });

  it('commits IME text without sending, then sends on a normal Enter', async () => {
    render(<Composer />);
    const textarea = screen.getByRole('textbox', { name: 'Ask about this paper' });

    fireEvent.compositionStart(textarea, { data: 'caopd' });
    const accepted = fireEvent.keyDown(textarea, {
      key: 'Enter',
      code: 'Enter',
      keyCode: 229,
      isComposing: true,
    });
    fireEvent.compositionEnd(textarea, { data: '草坪灯' });

    expect(accepted).toBe(true);
    expect(mocks.submit).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      isComposing: false,
    });

    await waitFor(() => expect(mocks.submit).toHaveBeenCalledWith('cao p d'));
  });
});
