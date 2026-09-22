import { openPaperFlowDatabase } from '../../db/PaperFlowDatabase';
import type { PaperInfo } from '../../types';
import { searchClient } from './searchClient';
import type { SearchIndexDocument } from './searchIndex';

async function documentForPaper(paper: PaperInfo): Promise<SearchIndexDocument> {
  const db = await openPaperFlowDatabase();
  const [paperTags, collectionItems, notes, annotations, memory, chunks, ocrPages] = await Promise.all([
    db.paperTags.where('paperId').equals(paper.id).toArray(),
    db.collectionItems.where('paperId').equals(paper.id).toArray(),
    db.notes.where('paperId').equals(paper.id).toArray(),
    db.annotations.where('paperId').equals(paper.id).toArray(),
    db.paperMemory.where('paperId').equals(paper.id).first(),
    db.paperChunks.where('paperId').equals(paper.id).toArray(),
    db.ocrPages.where('paperId').equals(paper.id).toArray(),
  ]);
  const [tags, collections] = await Promise.all([
    db.tags.bulkGet(paperTags.filter((item) => !item.deletedAt).map((item) => item.tagId)),
    db.collections.bulkGet(collectionItems.filter((item) => !item.deletedAt).map((item) => item.collectionId)),
  ]);
  return {
    id: paper.id,
    title: paper.title,
    authors: paper.authors || '',
    abstract: paper.abstract || '',
    tags: tags.filter((item) => item && !item.deletedAt).map((item) => item?.name).join(' '),
    collections: collections.filter((item) => item && !item.deletedAt).map((item) => item?.name).join(' '),
    body: [
      paper.journal,
      paper.source,
      ...notes.filter((item) => !item.deletedAt).flatMap((item) => [item.title, item.content]),
      ...annotations.filter((item) => !item.deletedAt).flatMap((item) => [item.text, item.comment]),
      memory && !memory.deletedAt ? memory.content : '',
      ...chunks.filter((item) => item.source !== 'ocr').map((item) => item.text),
      ...ocrPages.filter((item) => item.status === 'complete').map((item) => item.text),
    ].filter(Boolean).join('\n'),
  };
}

export async function buildSearchDocuments(
  onProgress?: (completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<SearchIndexDocument[]> {
  const db = await openPaperFlowDatabase();
  const [
    allPapers,
    paperTags,
    tags,
    collectionItems,
    collections,
    notes,
    annotations,
    memories,
    chunks,
    ocrPages,
  ] = await Promise.all([
    db.papers.toArray(),
    db.paperTags.toArray(),
    db.tags.toArray(),
    db.collectionItems.toArray(),
    db.collections.toArray(),
    db.notes.toArray(),
    db.annotations.toArray(),
    db.paperMemory.toArray(),
    db.paperChunks.toArray(),
    db.ocrPages.toArray(),
  ]);
  const papers = allPapers.filter((paper) => paper.libraryState === 'saved' && !paper.deletedAt);
  const tagById = new Map(tags.filter((item) => !item.deletedAt).map((item) => [item.id, item.name]));
  const collectionById = new Map(collections.filter((item) => !item.deletedAt).map((item) => [item.id, item.name]));
  const valuesByPaper = new Map<string, {
    tags: string[];
    collections: string[];
    body: string[];
  }>();
  const values = (paperId: string) => {
    const current = valuesByPaper.get(paperId) || { tags: [], collections: [], body: [] };
    valuesByPaper.set(paperId, current);
    return current;
  };
  for (const relation of paperTags) {
    const name = !relation.deletedAt ? tagById.get(relation.tagId) : undefined;
    if (name) values(relation.paperId).tags.push(name);
  }
  for (const relation of collectionItems) {
    const name = !relation.deletedAt ? collectionById.get(relation.collectionId) : undefined;
    if (name) values(relation.paperId).collections.push(name);
  }
  for (const note of notes) if (!note.deletedAt) values(note.paperId).body.push(note.title, note.content);
  for (const annotation of annotations) {
    if (!annotation.deletedAt) values(annotation.paperId).body.push(annotation.text, annotation.comment || '');
  }
  for (const memory of memories) if (!memory.deletedAt) values(memory.paperId).body.push(memory.content);
  for (const chunk of chunks) if (chunk.source !== 'ocr') values(chunk.paperId).body.push(chunk.text);
  for (const page of ocrPages) if (page.status === 'complete') values(page.paperId).body.push(page.text);
  const documents: SearchIndexDocument[] = [];
  for (let index = 0; index < papers.length; index += 1) {
    if (signal?.aborted) throw new DOMException('Search index rebuild cancelled.', 'AbortError');
    const paper = papers[index];
    const related = valuesByPaper.get(paper.id);
    documents.push({
      id: paper.id,
      title: paper.title,
      authors: paper.authors || '',
      abstract: paper.abstract || '',
      tags: related?.tags.join(' ') || '',
      collections: related?.collections.join(' ') || '',
      body: [paper.journal, paper.source, ...(related?.body || [])].filter(Boolean).join('\n'),
    });
    onProgress?.(index + 1, papers.length);
    if (index % 250 === 249) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return documents;
}

export async function rebuildSearchIndex(
  onProgress?: (phase: 'loading' | 'indexing', completed: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const documents = await buildSearchDocuments(
    (completed, total) => onProgress?.('loading', completed, total),
    signal,
  );
  await searchClient.rebuild(documents, signal);
}

export async function indexPaper(paperId: string): Promise<void> {
  const db = await openPaperFlowDatabase();
  const paper = await db.papers.get(paperId);
  if (!paper || paper.libraryState !== 'saved' || paper.deletedAt) {
    await searchClient.remove(paperId);
    return;
  }
  await searchClient.upsert(await documentForPaper(paper));
}
