import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation } from '../../src/components/chat/Conversation';
import { ModelSelector } from '../../src/components/composer/ModelSelector';
import { DATABASE_NAME, database } from '../../src/db/PaperFlowDatabase';
import { getPaperRelations } from '../../src/repositories/libraryRepository';
import { openPaperWorkspace } from '../../src/services/database';
import { useAppStore } from '../../src/store/useAppStore';

beforeEach(async () => {
  database.close();
  await Dexie.delete(DATABASE_NAME);
  useAppStore.setState({
    messages: [],
    paper: null,
    sending: false,
    uiLanguage: 'en',
  });
});

afterEach(async () => {
  cleanup();
  database.close();
  await Dexie.delete(DATABASE_NAME);
});

describe('conversation actions', () => {
  it('renders bracket-delimited inline and display formulas with KaTeX', () => {
    useAppStore.setState({
      messages: [{
        id: 'assistant:math',
        role: 'assistant',
        content: [
          '## Reward calibration',
          '',
          '其中，\\(\\mathbf{1}[y \\equiv y^*]\\) 表示正确性。',
          '',
          '\\[',
          '\\boxed{R_{\\text{RLCR}}(y,q,y^*) = \\mathbf{1}[y \\equiv y^*] - (q-\\mathbf{1}[y \\equiv y^*])^2}',
          '\\]',
          '',
          '[ \\mathrm{LayerNorm}\\bigl(x+\\mathrm{Sublayer}(x)\\bigr) ]',
          '',
          '其中 (\\mathrm{Residual}(x)) 是残差输出。',
        ].join('\n'),
      }],
    });

    const { container } = render(<Conversation />);

    expect(container.querySelector('.message-body h2')).toHaveTextContent('Reward calibration');
    const visibleMath = Array.from(container.querySelectorAll('.message-body .katex-html'))
      .map((element) => element.textContent)
      .join(' ');
    expect(visibleMath).toContain('RLCR');
    expect(visibleMath).toContain('y≡y');
    expect(visibleMath).toContain('LayerNorm');
    expect(visibleMath).toContain('Residual');
    expect(container.querySelectorAll('.message-body .katex')).toHaveLength(4);
    expect(container.querySelector('.message-body .katex-display')).toBeInTheDocument();
    expect(container.querySelector('.message-body .katex-error')).not.toBeInTheDocument();
  });

  it('saves an assistant response as a visible library note', async () => {
    const { paper } = await openPaperWorkspace({
      id: 'paper:conversation',
      shortTitle: 'CONVERSATION',
      title: 'Conversation Paper',
      source: 'PDF',
      url: 'https://example.com/conversation.pdf',
    });
    useAppStore.setState({
      paper,
      messages: [{
        id: 'assistant:1',
        paperId: paper.id,
        role: 'assistant',
        content: '## Key result\n\nEvidence from the paper.',
        model: 'gpt-4.1-mini',
      }],
    });

    render(<Conversation />);
    await userEvent.click(screen.getByTitle('Save as a library note'));

    await waitFor(async () => {
      expect((await getPaperRelations(paper.id)).notes).toHaveLength(1);
    });
    expect(screen.getByTitle('Saved as a library note')).toBeDisabled();
    expect((await getPaperRelations(paper.id)).notes[0]).toMatchObject({
      title: 'AI note · Key result',
      content: '## Key result\n\nEvidence from the paper.',
    });
  });

  it('selects and persists a concrete Codex subscription model', async () => {
    const close = vi.fn();
    useAppStore.setState({
      providerMode: 'chatgpt',
      model: 'ChatGPT via Codex',
      uiLanguage: 'en',
    });

    render(<ModelSelector close={close} />);
    await userEvent.click(screen.getByRole('button', { name: 'gpt-5.6-sol' }));

    expect(useAppStore.getState().model).toBe('gpt-5.6-sol');
    expect(localStorage.getItem('paperflow:codex-model')).toBe('gpt-5.6-sol');
    expect(close).toHaveBeenCalledOnce();
  });
});
