import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy, PageViewport, RenderTask } from 'pdfjs-dist';
import { PdfPage } from '../../src/components/reader/PdfPage';

vi.mock('pdfjs-dist', async (importOriginal) => {
  const original = await importOriginal<typeof import('pdfjs-dist')>();
  return {
    ...original,
    TextLayer: class {
      render() {
        return Promise.resolve();
      }

      cancel() {}
    },
  };
});

describe('PDF external links', () => {
  it('renders safe PDF link annotations as native new-tab anchors', async () => {
    const viewport = {
      scale: 1,
      userUnit: 1,
      width: 612,
      height: 792,
      convertToViewportPoint: (x: number, y: number) => [x, 792 - y],
    } as unknown as PageViewport;
    const page = {
      getViewport: () => viewport,
      getAnnotations: vi.fn(async () => [
        {
          id: 'github',
          subtype: 'Link',
          url: 'https://github.com/SalesforceAIResearch/CaOPD',
          rect: [100, 600, 300, 620],
        },
        {
          id: 'unsafe',
          subtype: 'Link',
          url: 'javascript:alert(1)',
          rect: [100, 500, 300, 520],
        },
      ]),
      getTextContent: vi.fn(async () => ({ items: [], styles: {} })),
      render: vi.fn(() => ({
        promise: Promise.resolve(),
        cancel: vi.fn(),
      }) as unknown as RenderTask),
    };
    const document = {
      getPage: vi.fn(async () => page),
    } as unknown as PDFDocumentProxy;

    render(<PdfPage
      document={document}
      pageNumber={1}
      scale={1}
      searchQuery=""
      annotations={[]}
      annotationTool="select"
      annotationColor="#f4cf4f"
      language="en"
      onViewportReady={vi.fn()}
      onCreateAnnotation={vi.fn()}
      onSelectAnnotation={vi.fn()}
      onUpdateAnnotation={vi.fn()}
      onDeleteAnnotation={vi.fn()}
      forceRender
    />);

    const link = await screen.findByRole('link', {
      name: 'Open external link: https://github.com/SalesforceAIResearch/CaOPD',
    });
    expect(link).toHaveAttribute('href', 'https://github.com/SalesforceAIResearch/CaOPD');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('does not reuse a canvas after a stale annotation request completes', async () => {
    let resolveFirstAnnotations: (value: []) => void = () => undefined;
    const firstAnnotations = new Promise<[]>((resolve) => {
      resolveFirstAnnotations = resolve;
    });
    let annotationRequest = 0;
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        scale,
        userUnit: 1,
        width: 612 * scale,
        height: 792 * scale,
        convertToViewportPoint: (x: number, y: number) => [x, y],
      } as unknown as PageViewport)),
      getAnnotations: vi.fn(() => {
        annotationRequest += 1;
        return annotationRequest === 1 ? firstAnnotations : Promise.resolve([]);
      }),
      getTextContent: vi.fn(async () => ({ items: [], styles: {} })),
      render: vi.fn(() => ({
        promise: Promise.resolve(),
        cancel: vi.fn(),
      }) as unknown as RenderTask),
    };
    const document = {
      getPage: vi.fn(async () => page),
    } as unknown as PDFDocumentProxy;
    const props = {
      document,
      pageNumber: 1,
      searchQuery: '',
      annotations: [],
      annotationTool: 'select' as const,
      annotationColor: '#f4cf4f',
      language: 'en' as const,
      onViewportReady: vi.fn(),
      onCreateAnnotation: vi.fn(),
      onSelectAnnotation: vi.fn(),
      onUpdateAnnotation: vi.fn(),
      onDeleteAnnotation: vi.fn(),
      forceRender: true,
    };

    const { rerender } = render(<PdfPage {...props} scale={1} />);
    await waitFor(() => expect(page.getAnnotations).toHaveBeenCalledTimes(1));
    rerender(<PdfPage {...props} scale={2} />);
    await waitFor(() => expect(page.render).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveFirstAnnotations([]);
      await firstAnnotations;
    });

    expect(page.render).toHaveBeenCalledTimes(1);
    expect(page.getViewport).toHaveBeenLastCalledWith({ scale: 2 });
  });
});
