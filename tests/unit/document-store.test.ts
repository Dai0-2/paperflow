import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE_NAME, database } from '../../src/db/PaperFlowDatabase';
import {
  isPdfCloudSyncEnabled,
  queueStoredDocumentsForSync,
  setPdfCloudSyncEnabled,
} from '../../src/services/storage/documentStore';

beforeEach(async () => {
  database.close();
  await Dexie.delete(DATABASE_NAME);
  await database.open();
  await database.papers.put({
    id: 'paper:local-pdf',
    shortTitle: 'LOCAL PDF',
    title: 'Local PDF',
    source: 'arXiv',
    url: 'https://arxiv.org/pdf/2507.16806',
    libraryState: 'saved',
  });
  await database.documents.put({
    id: 'document:paper:local-pdf:hash',
    paperId: 'paper:local-pdf',
    contentHash: 'hash',
    name: 'paper.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    localState: 'available',
    remoteState: 'none',
    createdAt: 1,
    updatedAt: 1,
    version: { counter: 0, deviceId: 'local-only' },
  });
});

afterEach(async () => {
  database.close();
  await Dexie.delete(DATABASE_NAME);
});

describe('PDF cloud sync preference', () => {
  it('keeps offline PDFs local unless cloud backup is explicitly enabled', async () => {
    expect(await isPdfCloudSyncEnabled()).toBe(false);

    await queueStoredDocumentsForSync('paper:local-pdf');
    expect((await database.documents.toArray())[0].remoteState).toBe('none');
    expect(await database.syncOps.where('entityType').equals('document').count()).toBe(0);

    await setPdfCloudSyncEnabled(true);
    expect((await database.documents.toArray())[0].remoteState).toBe('queued');
    expect(await database.syncOps.where('entityType').equals('document').count()).toBe(1);

    await setPdfCloudSyncEnabled(false);
    expect((await database.documents.toArray())[0].remoteState).toBe('none');
    expect(await database.syncOps.where('entityType').equals('document').count()).toBe(0);
  });
});
