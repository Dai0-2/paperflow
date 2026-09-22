import { openPaperFlowDatabase } from '../db/PaperFlowDatabase';
import { indexPaper } from '../services/search/searchIndexer';
import type { Annotation } from '../types';
import { versionAndRecord } from './versioning';

export type AnnotationDraft = Omit<
  Annotation,
  'id' | 'paperId' | 'createdAt' | 'updatedAt' | 'version' | 'deletedAt'
>;

export async function listAnnotations(paperId: string): Promise<Annotation[]> {
  const db = await openPaperFlowDatabase();
  return (await db.annotations.where('paperId').equals(paperId).toArray())
    .filter((annotation) => !annotation.deletedAt)
    .sort((left, right) => left.page - right.page || left.createdAt - right.createdAt);
}

export async function createAnnotation(
  paperId: string,
  draft: AnnotationDraft,
): Promise<Annotation> {
  const now = Date.now();
  const annotation: Annotation = {
    ...draft,
    id: crypto.randomUUID(),
    paperId,
    type: draft.type || 'highlight',
    text: draft.text || '',
    createdAt: now,
    updatedAt: now,
  };
  return persistAnnotation(annotation);
}

export async function updateAnnotation(
  annotationId: string,
  patch: Partial<Pick<Annotation, 'color' | 'comment' | 'text' | 'quadPoints' | 'rect' | 'strokes' | 'anchor'>>,
): Promise<Annotation> {
  const db = await openPaperFlowDatabase();
  const current = await db.annotations.get(annotationId);
  if (!current || current.deletedAt) throw new Error('Annotation was not found.');
  return persistAnnotation({ ...current, ...patch, updatedAt: Date.now() });
}

export async function deleteAnnotation(annotationId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  const current = await db.annotations.get(annotationId);
  if (!current || current.deletedAt) return;
  const paper = await db.papers.get(current.paperId);
  const now = Date.now();

  await db.transaction('rw', db.annotations, db.syncState, db.syncOps, async () => {
    const next: Annotation = { ...current, deletedAt: now, updatedAt: now };
    if (paper?.libraryState === 'saved') {
      const mutation = await versionAndRecord(db, 'annotation', current.id, 'delete', next);
      next.version = mutation.version;
      await db.annotations.put(next);
      await db.syncOps.update(mutation.operation.id, { payload: next });
    } else {
      await db.annotations.put(next);
    }
  });
  await indexPaper(current.paperId).catch(() => undefined);
}

export async function queueAnnotationsForSync(paperId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  const paper = await db.papers.get(paperId);
  if (paper?.libraryState !== 'saved') return;
  await db.transaction('rw', db.annotations, db.syncState, db.syncOps, async () => {
    const annotations = await db.annotations.where('paperId').equals(paperId).toArray();
    for (const annotation of annotations.filter((item) => (
      !item.version || item.version.deviceId === 'legacy-v1'
    ))) {
      const action = annotation.deletedAt ? 'delete' : 'put';
      const mutation = await versionAndRecord(db, 'annotation', annotation.id, action, annotation);
      const versioned = { ...annotation, version: mutation.version };
      await db.annotations.put(versioned);
      await db.syncOps.update(mutation.operation.id, { payload: versioned });
    }
  });
}

async function persistAnnotation(annotation: Annotation): Promise<Annotation> {
  const db = await openPaperFlowDatabase();
  const paper = await db.papers.get(annotation.paperId);
  const result = await db.transaction('rw', db.annotations, db.syncState, db.syncOps, async () => {
    const next = { ...annotation, deletedAt: undefined };
    if (paper?.libraryState !== 'saved') {
      await db.annotations.put(next);
      return next;
    }
    const mutation = await versionAndRecord(db, 'annotation', next.id, 'put', next);
    const versioned = { ...next, version: mutation.version };
    await db.annotations.put(versioned);
    await db.syncOps.update(mutation.operation.id, { payload: versioned });
    return versioned;
  });
  await indexPaper(annotation.paperId).catch(() => undefined);
  return result;
}
