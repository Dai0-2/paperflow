import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnnotationLayer } from '../../src/components/annotations/AnnotationLayer';
import type { Annotation } from '../../src/types';

describe('translation overlay', () => {
  it('positions a transient translation without drawing or persisting a highlight', () => {
    const translation: Annotation = {
      id: 'translation:test',
      paperId: 'paper:test',
      page: 1,
      text: 'Selected passage',
      createdAt: 1,
      quadPoints: [{
        points: [
          { x: 20, y: 30 },
          { x: 120, y: 30 },
          { x: 120, y: 50 },
          { x: 20, y: 50 },
        ],
      }],
    };

    const { container } = render(<AnnotationLayer
      viewport={{
        width: 612,
        height: 792,
        convertToPdfPoint: (x, y) => [x, y],
        convertToViewportPoint: (x, y) => [x, y],
      }}
      annotations={[]}
      translationAnnotations={[translation]}
      tool="select"
      color="#f4cf4f"
      language="en"
      translationStatus={new Map([[translation.id, 'Translated passage']])}
      onCreate={vi.fn()}
      onSelect={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
    />);

    expect(screen.getByText('Translated passage')).toBeInTheDocument();
    expect(container.querySelector('.annotation-highlight')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.annotation-hit')).toHaveLength(0);
  });
});
