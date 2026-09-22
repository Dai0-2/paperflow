import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation,
  type AnnotationDraft,
} from '../repositories/annotationRepository';
import type { Annotation, AnnotationType } from '../types';

export type AnnotationTool = 'select' | AnnotationType;

export function useAnnotationTool(paperId?: string) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool>('select');
  const [color, setColor] = useState('#f4cf4f');
  const [selectedId, setSelectedId] = useState<string>();

  useEffect(() => {
    let active = true;
    setAnnotations([]);
    setSelectedId(undefined);
    if (!paperId) return () => { active = false; };
    void listAnnotations(paperId).then((records) => {
      if (active) setAnnotations(records);
    });
    return () => { active = false; };
  }, [paperId]);

  const add = useCallback(async (draft: AnnotationDraft) => {
    if (!paperId) throw new Error('Open a paper before adding annotations.');
    const annotation = await createAnnotation(paperId, { ...draft, color: draft.color || color });
    setAnnotations((current) => [...current, annotation]);
    setSelectedId(annotation.id);
    return annotation;
  }, [color, paperId]);

  const update = useCallback(async (
    annotationId: string,
    patch: Parameters<typeof updateAnnotation>[1],
  ) => {
    const annotation = await updateAnnotation(annotationId, patch);
    setAnnotations((current) => current.map((item) => item.id === annotation.id ? annotation : item));
    return annotation;
  }, []);

  const remove = useCallback(async (annotationId: string) => {
    await deleteAnnotation(annotationId);
    setAnnotations((current) => current.filter((item) => item.id !== annotationId));
    setSelectedId((current) => current === annotationId ? undefined : current);
  }, []);

  const selected = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId),
    [annotations, selectedId],
  );

  return {
    annotations,
    tool,
    color,
    selected,
    setTool,
    setColor,
    select: setSelectedId,
    add,
    update,
    remove,
  };
}
