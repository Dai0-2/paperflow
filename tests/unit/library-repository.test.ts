import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_NAME, database } from '../../src/db/PaperFlowDatabase';
import {
  addPaperToCollection,
  addTagToPaper,
  createCollection,
  createOrGetTag,
  deleteCollection,
  getPaperRelations,
  mergeTags,
  movePaperToTrash,
  restorePaper,
  saveAiAnswerAsNote,
  saveNote,
  savePaperMemoryToLibrary,
  savePaperToLibrary,
  updateTag,
} from '../../src/repositories/libraryRepository';
import {
  loadPaperMemory,
  openPaperWorkspace,
} from '../../src/services/database';
import { paperFromUrl } from '../../src/services/paper';

beforeEach(async () => {
  database.close();
  await Dexie.delete(DATABASE_NAME);
});

afterEach(async () => {
  database.close();
  await Dexie.delete(DATABASE_NAME);
});

describe('library repository', () => {
  it('keeps an opened paper temporary until the user saves it', async () => {
    const { paper } = await openPaperWorkspace({
      id: 'paper:test',
      shortTitle: 'TEST',
      title: 'Test Paper',
      source: 'PDF',
      url: 'https://example.com/test.pdf',
    });
    expect(paper.libraryState).toBe('temporary');
    expect(await database.syncOps.count()).toBe(0);

    const saved = await savePaperToLibrary(paper.id);
    expect(saved.libraryState).toBe('saved');
    expect(saved.favorite).toBe(true);
    expect(await database.syncOps.where('entityId').equals(paper.id).count()).toBe(1);
  });

  it('restores arXiv memory across URL versions and syncs it when saved', async () => {
    const first = await openPaperWorkspace(paperFromUrl(
      'https://arxiv.org/pdf/2507.16806v1',
      'Initial title',
    ));
    const saved = await savePaperMemoryToLibrary(first.paper.id, 'Persistent note');

    const reopened = await openPaperWorkspace(paperFromUrl(
      'https://arxiv.org/pdf/2507.16806v2',
      'Updated title',
    ));

    expect(reopened.paper.id).toBe(first.paper.id);
    expect(saved.libraryState).toBe('saved');
    expect((await loadPaperMemory(reopened.paper.id))?.content).toBe('Persistent note');
    expect(await database.syncOps.where('entityType').equals('paperMemory').count()).toBe(1);
  });

  it('saves an AI answer as an idempotent library note', async () => {
    const { paper } = await openPaperWorkspace({
      id: 'paper:ai-note',
      shortTitle: 'AI NOTE',
      title: 'AI Note Paper',
      source: 'PDF',
      url: 'https://example.com/ai-note.pdf',
    });

    const first = await saveAiAnswerAsNote(
      paper.id,
      'message:1',
      'AI note · Key result',
      'The answer in Markdown.',
    );
    const second = await saveAiAnswerAsNote(
      paper.id,
      'message:1',
      'AI note · Updated result',
      'The updated answer.',
    );

    expect(first.paper.libraryState).toBe('saved');
    expect(second.note.id).toBe(first.note.id);
    expect((await getPaperRelations(paper.id)).notes).toEqual([
      expect.objectContaining({
        title: 'AI note · Updated result',
        content: 'The updated answer.',
      }),
    ]);
    expect(await database.syncOps.where('entityType').equals('note').count()).toBe(2);
  });

  it('versions collection, tag, note, trash, and restore mutations', async () => {
    const { paper } = await openPaperWorkspace({
      id: 'paper:organized',
      shortTitle: 'ORGANIZED',
      title: 'Organized Paper',
      source: 'PDF',
      url: 'https://example.com/organized.pdf',
    });
    await savePaperToLibrary(paper.id);
    const collection = await createCollection('Reading queue');
    const child = await createCollection('This week', collection.id);
    const tag = await createOrGetTag('Methods', '#447766');
    await addPaperToCollection(paper.id, collection.id);
    await addTagToPaper(paper.id, tag.id);
    await saveNote(paper.id, { title: 'Key result', content: 'Important evidence.' });

    const relations = await getPaperRelations(paper.id);
    expect(relations.collections.map(({ name }) => name)).toEqual(['Reading queue']);
    expect(relations.tags.map(({ name }) => name)).toEqual(['Methods']);
    expect(relations.notes[0].content).toBe('Important evidence.');

    await updateTag(tag.id, { name: 'Research methods', color: '#225577' });
    const targetTag = await createOrGetTag('Methodology');
    await mergeTags(tag.id, targetTag.id);
    expect((await getPaperRelations(paper.id)).tags.map(({ name }) => name)).toEqual(['Methodology']);

    await deleteCollection(collection.id);
    expect((await database.collections.get(child.id))?.parentId).toBeUndefined();
    expect((await database.collectionItems.get(`${collection.id}:${paper.id}`))?.deletedAt).toBeTypeOf('number');

    await movePaperToTrash(paper.id);
    expect((await database.papers.get(paper.id))?.libraryState).toBe('trashed');
    await restorePaper(paper.id);
    expect((await database.papers.get(paper.id))?.libraryState).toBe('saved');
    expect(await database.syncOps.count()).toBeGreaterThanOrEqual(9);
  });
});
