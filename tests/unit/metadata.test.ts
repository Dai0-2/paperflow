import { describe, expect, it } from 'vitest';
import { refreshPaperMetadata } from '../../src/services/library/metadata';
import type { PaperInfo } from '../../src/types';

function paper(patch: Partial<PaperInfo>): PaperInfo {
  return {
    id: 'paper:metadata',
    shortTitle: 'Metadata',
    title: 'Metadata',
    source: 'Imported',
    url: '',
    ...patch,
  };
}

describe('metadata refresh', () => {
  it('maps Crossref metadata for DOI papers', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      message: {
        title: ['Verified title'],
        author: [{ given: 'Ada', family: 'Lovelace' }],
        issued: { 'date-parts': [[1843]] },
        'container-title': ['Journal of Engines'],
        DOI: '10.1000/TEST',
      },
    }), { status: 200 });
    await expect(refreshPaperMetadata(paper({ doi: 'https://doi.org/10.1000/test' }), fetcher))
      .resolves.toMatchObject({
        title: 'Verified title',
        authors: 'Ada Lovelace',
        year: '1843',
        doi: '10.1000/test',
      });
  });

  it('maps arXiv Atom metadata without requiring a remote script', async () => {
    const fetcher: typeof fetch = async () => new Response(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom"><entry>
        <title>Local first systems</title>
        <summary>Offline research workflow.</summary>
        <published>2024-03-04T00:00:00Z</published>
        <author><name>Grace Hopper</name></author>
      </entry></feed>`, { status: 200 });
    await expect(refreshPaperMetadata(paper({ arxivId: '2403.00001' }), fetcher))
      .resolves.toMatchObject({
        title: 'Local first systems',
        authors: 'Grace Hopper',
        year: '2024',
        arxivId: '2403.00001',
      });
  });
});
