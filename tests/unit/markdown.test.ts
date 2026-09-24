import { describe, expect, it } from 'vitest';
import { normalizeMathDelimiters } from '../../src/services/markdown';

describe('AI answer Markdown', () => {
  it('normalizes common LaTeX delimiters without changing code', () => {
    const input = [
      'Inline: \\(q - \\mathbf{1}[y \\equiv y^*]\\).',
      '',
      '\\[',
      '\\boxed{R_{\\text{RLCR}}(y,q,y^*) = \\mathbf{1}[y \\equiv y^*] - (q-\\mathbf{1}[y \\equiv y^*])^2}',
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
      '\\boxed{R_{\\text{RLCR}}(y,q,y^*) = \\mathbf{1}[y \\equiv y^*] - (q-\\mathbf{1}[y \\equiv y^*])^2}',
      '$$',
      '',
      '`\\(literal\\)`',
      '```tex',
      '\\[literal\\]',
      '```',
    ].join('\n'));
  });

  it('recovers bare bracket formulas emitted without math delimiters', () => {
    const input = [
      '[ (x_1,\\ldots,x_n)\\rightarrow z=(z_1,\\ldots,z_n) ]',
      '',
      '其中 (\\mathrm{Sublayer}(x)) 是子层输出，(i) 是普通文本。',
      '',
      '[Page 2]',
      '`(\\mathrm{literal})`',
    ].join('\n');

    expect(normalizeMathDelimiters(input)).toBe([
      '$$',
      '(x_1,\\ldots,x_n)\\rightarrow z=(z_1,\\ldots,z_n)',
      '$$',
      '',
      '其中 $\\mathrm{Sublayer}(x)$ 是子层输出，(i) 是普通文本。',
      '',
      '[Page 2]',
      '`(\\mathrm{literal})`',
    ].join('\n'));
  });
});
