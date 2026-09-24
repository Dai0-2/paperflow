import { describe, expect, it } from 'vitest';
import { normalizeMathDelimiters } from '../../src/services/markdown';

describe('AI answer Markdown', () => {
  it('normalizes common LaTeX delimiters without changing code', () => {
    const input = [
      'Inline: \\(q - \\mathbf{1}[y \\equiv y^*]\\).',
      '',
      '\\[',
      '\\boxed{R_{\\text{RLCR}}(y,q,y^*)}',
      '\\]',
      '',
      '`\\(literal\\)`',
      '```tex',
      '\\[literal\\]',
      '```',
    ].join('\n');

    expect(normalizeMathDelimiters(input)).toBe([
      'Inline: $q - \\mathbf{1}[y \\equiv y^*]$.',
      '',
      '$$',
      '\\boxed{R_{\\text{RLCR}}(y,q,y^*)}',
      '$$',
      '',
      '`\\(literal\\)`',
      '```tex',
      '\\[literal\\]',
      '```',
    ].join('\n'));
  });
});
