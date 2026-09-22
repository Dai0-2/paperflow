import { describe, expect, it } from 'vitest';
import type { PaperInfo } from '../../src/types';
import {
  exportReferences,
  formatCitation,
  previewReferenceImport,
} from '../../src/services/library/citations';

const paper: PaperInfo = {
  id: 'paper:attention',
  shortTitle: 'Attention Is All You Need',
  title: 'Attention Is All You Need',
  authors: 'Ashish Vaswani and Noam Shazeer',
  year: '2017',
  source: 'NeurIPS',
  journal: 'Advances in Neural Information Processing Systems',
  url: 'https://arxiv.org/pdf/1706.03762',
  doi: '10.48550/arXiv.1706.03762',
  libraryState: 'saved',
  readStatus: 'read',
};

describe('Citation.js import and export', () => {
  it('round-trips identity fields through BibTeX and RIS', () => {
    for (const format of ['bibtex', 'ris'] as const) {
      const exported = exportReferences([paper], format);
      const preview = previewReferenceImport(exported, []);
      expect(preview.errors).toEqual([]);
      expect(preview.items).toHaveLength(1);
      expect(preview.items[0].paper).toMatchObject({
        title: paper.title,
        year: paper.year,
        doi: paper.doi?.toLowerCase(),
      });
    }
  });

  it('classifies exact identifiers as updates and title matches as possible duplicates', () => {
    const exact = previewReferenceImport(exportReferences([paper], 'bibtex'), [paper]);
    expect(exact.items[0].disposition).toBe('update');

    const candidate = previewReferenceImport(
      '@article{candidate,title={Attention Is All You Need: Revised},author={Vaswani, Ashish},year={2018}}',
      [paper],
    );
    expect(candidate.items[0].disposition).toBe('duplicate');
  });

  it('formats all supported clipboard citation styles without inventing identifiers', () => {
    for (const format of ['apa', 'mla', 'chicago', 'ieee', 'bibtex'] as const) {
      expect(formatCitation(paper, format)).toContain('Attention');
    }
    expect(formatCitation({ ...paper, doi: undefined, url: '' }, 'ieee')).not.toContain('doi.org');
  });
});
