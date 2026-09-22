import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_NAME, database } from '../../src/db/PaperFlowDatabase';
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from '../../src/repositories/annotationRepository';
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

describe('annotation repository', () => {
  it('keeps temporary annotations local and queues them when the paper is saved', async () => {
    const { paper } = await openPaperWorkspace({
      id: 'paper:annotations',
      shortTitle: 'ANNOTATIONS',
      title: 'Annotation repository',
      source: 'PDF',
      url: 'https://example.com/annotations.pdf',
    });
    const created = await createAnnotation(paper.id, {
      page: 1,
      type: 'highlight',
      text: 'Stable selection',
      color: '#f4cf4f',
      quadPoints: [{
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 20 },
          { x: 30, y: 10 },
          { x: 10, y: 10 },
        ],
      }],
    });

    expect(created.version).toBeUndefined();
    expect(await database.syncOps.where('entityType').equals('annotation').count()).toBe(0);

    await savePaperToLibrary(paper.id);
    expect((await database.annotations.get(created.id))?.version).toBeDefined();
    expect(await database.syncOps.where('entityType').equals('annotation').count()).toBe(1);

    await updateAnnotation(created.id, { comment: 'Important evidence' });
    expect((await database.annotations.get(created.id))?.comment).toBe('Important evidence');
    await deleteAnnotation(created.id);
    expect((await database.annotations.get(created.id))?.deletedAt).toBeTypeOf('number');
    expect(await database.syncOps.where('entityType').equals('annotation').count()).toBe(3);
  });
});
