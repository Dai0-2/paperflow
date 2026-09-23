import { describe, expect, it } from 'vitest';
import { annotationsWithComments } from '../../src/components/reader/ReaderPanels';
import type { Annotation } from '../../src/types';

function annotation(
  id: string,
  patch: Partial<Annotation> = {},
): Annotation {
  return {
    id,
    paperId: 'paper:test',
    page: 1,
    text: 'Selected passage',
    createdAt: 1,
    type: 'highlight',
    ...patch,
  };
}

describe('reader annotation sidebar', () => {
  it('shows only annotations with an authored comment', () => {
    const visible = annotationsWithComments([
      annotation('plain-highlight'),
      annotation('translation-only', { translation: '译文' }),
      annotation('blank-comment', { comment: '   ' }),
      annotation('commented', { comment: 'Key evidence', translation: '译文' }),
    ]);

    expect(visible.map(({ id }) => id)).toEqual(['commented']);
  });
});
