import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { PaperFlowDatabase } from '../../src/db/PaperFlowDatabase';

const databaseNames: string[] = [];

function createLegacyDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      const papers = db.createObjectStore('papers', { keyPath: 'id' });
      papers.createIndex('updatedAt', 'updatedAt');
      const aliases = db.createObjectStore('paperAliases', { keyPath: 'alias' });
      aliases.createIndex('paperId', 'paperId');
      const threads = db.createObjectStore('threads', { keyPath: 'id' });
      threads.createIndex('paperId', 'paperId');
      threads.createIndex('updatedAt', 'updatedAt');
      const messages = db.createObjectStore('messages', { keyPath: 'id' });
      messages.createIndex('paperId', 'paperId');
      messages.createIndex('threadId', 'threadId');
      const memory = db.createObjectStore('paperMemory', { keyPath: 'id' });
      memory.createIndex('paperId', 'paperId', { unique: true });
      const selections = db.createObjectStore('selections', { keyPath: 'id' });
      selections.createIndex('paperId', 'paperId');
      const annotations = db.createObjectStore('annotations', { keyPath: 'id' });
      annotations.createIndex('paperId', 'paperId');
      db.createObjectStore('settings', { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['papers', 'annotations'], 'readwrite');
      tx.objectStore('papers').put({
        id: 'paper:legacy',
        shortTitle: 'LEGACY',
        title: 'Legacy paper',
        source: 'PDF',
        url: 'https://example.com/legacy.pdf',
        updatedAt: 123,
      });
      tx.objectStore('annotations').put({
        id: 'annotation:legacy',
        paperId: 'paper:legacy',
        page: 1,
        text: 'legacy note',
        createdAt: 123,
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

describe('Dexie migrations', () => {
  it('preserves v1 data and adds local-first and sync recovery stores', async () => {
    const name = `paperflow-test-${crypto.randomUUID()}`;
    databaseNames.push(name);
    await createLegacyDatabase(name);

    const db = new PaperFlowDatabase(name);
    await db.open();
    const paper = await db.papers.get('paper:legacy');
    const annotation = await db.annotations.get('annotation:legacy');

    expect(paper).toMatchObject({
      title: 'Legacy paper',
      libraryState: 'temporary',
      favorite: false,
      readStatus: 'unread',
    });
    expect(paper?.version?.deviceId).toBe('legacy-v1');
    expect(annotation).toMatchObject({ type: 'highlight', updatedAt: 123 });
    expect(await db.collections.count()).toBe(0);
    expect(await db.syncConflicts.count()).toBe(0);
    expect(await db.syncCheckpoints.count()).toBe(0);
    db.close();
  });
});
