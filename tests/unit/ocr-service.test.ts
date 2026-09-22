import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DATABASE_NAME,
  database,
  openPaperFlowDatabase,
} from '../../src/db/PaperFlowDatabase';
import { recoverStaleOcrJobs } from '../../src/services/ocr/ocrService';

beforeEach(async () => {
  database.close();
  await Dexie.delete(DATABASE_NAME);
});

afterEach(async () => {
  database.close();
  await Dexie.delete(DATABASE_NAME);
});

describe('OCR recovery', () => {
  it('cancels stale work without changing completed pages', async () => {
    const old = Date.now() - 60_000;
    await openPaperFlowDatabase();
    await database.ocrPages.bulkPut([
      {
        id: 'document:one:ocr:1',
        paperId: 'paper:one',
        documentId: 'document:one',
        page: 1,
        text: '',
        language: 'eng',
        confidence: 0,
        engineVersion: 'tesseract.js-7',
        status: 'running',
        updatedAt: old,
      },
      {
        id: 'document:one:ocr:2',
        paperId: 'paper:one',
        documentId: 'document:one',
        page: 2,
        text: 'Finished text',
        language: 'eng',
        confidence: 92,
        engineVersion: 'tesseract.js-7',
        status: 'complete',
        updatedAt: old,
      },
    ]);

    expect(await recoverStaleOcrJobs(1_000)).toBe(1);
    expect((await database.ocrPages.get('document:one:ocr:1'))?.status).toBe('cancelled');
    expect((await database.ocrPages.get('document:one:ocr:2'))?.status).toBe('complete');
  });
});
