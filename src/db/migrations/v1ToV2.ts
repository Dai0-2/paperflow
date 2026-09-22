import type { Transaction } from 'dexie';
import type {
  Annotation,
  PaperInfo,
  PaperMemory,
  PaperSelection,
  Thread,
} from '../../types';

const MIGRATION_DEVICE_ID = 'legacy-v1';

function legacyVersion(updatedAt: number) {
  return { counter: Math.max(1, Math.floor(updatedAt)), deviceId: MIGRATION_DEVICE_ID };
}

export async function migrateV1ToV2(transaction: Transaction): Promise<void> {
  const now = Date.now();

  await transaction.table<PaperInfo>('papers').toCollection().modify((paper) => {
    const updatedAt = paper.updatedAt || now;
    paper.createdAt ||= updatedAt;
    paper.accessedAt ||= updatedAt;
    paper.updatedAt = updatedAt;
    paper.libraryState ||= 'temporary';
    paper.favorite ??= false;
    paper.readStatus ||= 'unread';
    paper.version ||= legacyVersion(updatedAt);
  });

  await transaction.table<Thread>('threads').toCollection().modify((thread) => {
    thread.version ||= legacyVersion(thread.updatedAt || now);
  });

  await transaction.table<PaperMemory>('paperMemory').toCollection().modify((memory) => {
    memory.version ||= legacyVersion(memory.updatedAt || now);
  });

  await transaction.table<PaperSelection>('selections').toCollection().modify((selection) => {
    selection.updatedAt ||= selection.createdAt || now;
    selection.version ||= legacyVersion(selection.updatedAt);
  });

  await transaction.table<Annotation>('annotations').toCollection().modify((annotation) => {
    annotation.type ||= 'highlight';
    annotation.updatedAt ||= annotation.createdAt || now;
    annotation.version ||= legacyVersion(annotation.updatedAt);
  });
}
