import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_NAME, database } from '../../src/db/PaperFlowDatabase';
import { savePaperToLibrary } from '../../src/repositories/libraryRepository';
import { openPaperWorkspace } from '../../src/services/database';

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
});
