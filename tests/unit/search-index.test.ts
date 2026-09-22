import { describe, expect, it } from 'vitest';
import { PaperSearchIndex } from '../../src/services/search/searchIndex';

describe('paper search index', () => {
  it('indexes metadata, notes, PDF text, and Chinese text', () => {
    const index = new PaperSearchIndex();
    index.add([
      {
        id: 'paper:transformer',
        title: 'Attention Is All You Need',
        authors: 'Ashish Vaswani',
        abstract: 'A sequence transduction architecture.',
        tags: 'machine learning',
        collections: 'Foundations',
        body: 'The Transformer uses multi-head self attention.',
      },
      {
        id: 'paper:chinese',
        title: '大语言模型研究',
        authors: '研究团队',
        abstract: '讨论检索增强生成。',
        tags: '人工智能',
        collections: '中文论文',
        body: '本地全文搜索和离线阅读。',
      },
    ]);

    expect(index.search('transformer attention')).toEqual(['paper:transformer']);
    expect(index.search('检索增强')).toEqual(['paper:chinese']);
  });

  it('supports incremental replacement and removal', () => {
    const index = new PaperSearchIndex();
    index.upsert({
      id: 'paper:one',
      title: 'Initial title',
      authors: '',
      abstract: '',
      tags: '',
      collections: '',
      body: '',
    });
    expect(index.search('initial')).toEqual(['paper:one']);

    index.upsert({
      id: 'paper:one',
      title: 'Revised methods',
      authors: '',
      abstract: '',
      tags: '',
      collections: '',
      body: '',
    });
    expect(index.search('initial')).toEqual([]);
    expect(index.search('revised')).toEqual(['paper:one']);

    index.remove('paper:one');
    expect(index.search('revised')).toEqual([]);
  });
});
